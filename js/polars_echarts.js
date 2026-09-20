/*
 * Modern ECharts renderer for LSV TOXCct.
 *
 * The historical canvas renderer is loaded first and kept as a fallback. This
 * adapter exposes the same PolarsChart API, so the calculation and application
 * layers do not need to know which renderer is active.
 */
(function () {
	"use strict";

	if (!window.echarts || !window.PolarsChart) return;

	var legacyChart = window.PolarsChart;
	var sails = ["Jib", "LightJib", "Staysail", "Code0", "Spi", "LightGnk", "HeavyGnk"];
	var sailColors = {
		Jib: "#d62861",
		Spi: "#15a66a",
		Staysail: "#4263eb",
		LightJib: "#f08c84",
		Code0: "#0b8f87",
		HeavyGnk: "#8f2d56",
		LightGnk: "#e08a16"
	};

	var chart = null;
	var chartElement = null;
	var resizeObserver = null;
	var callback = null;
	var dragging = false;
	var dragAngleRange = null;
	var pinching = false;
	var pinchStartDistance = 0;
	var pinchStartZoom = 1;
	var zoomRenderFrame = null;
	var zoomOutButton = null;
	var zoomResetButton = null;
	var zoomInButton = null;
	var samples = [];
	var resultset = null;
	var cacheKey = "";
	var minZoom = 1;
	var maxZoom = 3;
	var zoomStep = 0.25;
	var state = {
		twa: 0,
		tws: 0,
		boatType: "",
		options: [],
		sailsSelected: [],
		showVMG: false,
		showSpeed: false,
		showFoils: false,
		radiusMax: 20,
		splitNumber: 5,
		zoomLevel: 1
	};

	function initChart() {
		if (chart) return true;
		chartElement = document.getElementById("polar_echart");
		if (!chartElement) return false;

		try {
			chart = window.echarts.init(chartElement, null, { renderer: "canvas" });
			chartElement.hidden = false;
			var panel = document.getElementById("chart_panel");
			panel.classList.add("is-echarts");
			["error_message", "info_message"].forEach(function (id) {
				var message = document.getElementById(id);
				if (message) panel.appendChild(message);
			});
			registerZoomControls();
			registerPointerEvents();
			if (window.ResizeObserver) {
				resizeObserver = new ResizeObserver(function () {
					chart.resize();
					if (resultset) render();
				});
				resizeObserver.observe(chartElement);
			} else {
				window.addEventListener("resize", function () {
					chart.resize();
				});
			}
			return true;
		} catch (error) {
			console.warn("ECharts could not be initialized; using the legacy renderer.", error);
			chart = null;
			chartElement.hidden = true;
			return false;
		}
	}

	function centeredRange(center, minimum, maximum, span) {
		span = Math.min(maximum - minimum, Math.max(0.001, span));
		var start = center - span / 2;
		var end = center + span / 2;
		if (start < minimum) {
			end += minimum - start;
			start = minimum;
		}
		if (end > maximum) {
			start -= end - maximum;
			end = maximum;
		}
		return {
			min: Math.max(minimum, start),
			max: Math.min(maximum, end)
		};
	}

	function calculateAngleRange() {
		if (state.zoomLevel <= minZoom) return { min: 0, max: 180 };
		return centeredRange(state.twa, 0, 180, 180 / state.zoomLevel);
	}

	function visibleAngleRange() {
		return dragAngleRange || calculateAngleRange();
	}

	function visibleRadiusRange() {
		if (state.zoomLevel <= minZoom || !resultset || !resultset.current) {
			return { min: 0, max: state.radiusMax };
		}
		return centeredRange(
			resultset.current.speed,
			0,
			state.radiusMax,
			state.radiusMax / state.zoomLevel
		);
	}

	function displayAngle(twa, angleRange) {
		return (twa - angleRange.min) * 180 / (angleRange.max - angleRange.min);
	}

	function angleIsVisible(twa, angleRange) {
		return twa >= angleRange.min - 0.001 && twa <= angleRange.max + 0.001;
	}

	function updateZoomControls() {
		if (!zoomResetButton) return;
		var percentage = Math.round(state.zoomLevel * 100);
		zoomResetButton.textContent = percentage + "%";
		zoomResetButton.setAttribute("aria-label", "Reset zoom from " + percentage + "% to 100%");
		zoomOutButton.disabled = state.zoomLevel <= minZoom + 0.001;
		zoomInButton.disabled = state.zoomLevel >= maxZoom - 0.001;
	}

	function setZoom(level) {
		var nextLevel = Math.max(minZoom, Math.min(maxZoom, Number(level) || minZoom));
		if (Math.abs(nextLevel - state.zoomLevel) < 0.001) return false;
		state.zoomLevel = nextLevel;
		updateZoomControls();
		scheduleZoomRender();
		return true;
	}

	function scheduleZoomRender() {
		if (!chart || !resultset) return;
		if (typeof window.requestAnimationFrame !== "function") {
			render();
			return;
		}
		if (zoomRenderFrame !== null) return;
		zoomRenderFrame = window.requestAnimationFrame(function () {
			zoomRenderFrame = null;
			render();
		});
	}

	function changeZoom(direction) {
		var nextLevel = Math.round((state.zoomLevel + direction * zoomStep) / zoomStep) * zoomStep;
		setZoom(nextLevel);
	}

	function resetZoom() {
		setZoom(minZoom);
	}

	function touchDistance(touches) {
		var dx = touches[0].clientX - touches[1].clientX;
		var dy = touches[0].clientY - touches[1].clientY;
		return Math.sqrt(dx * dx + dy * dy);
	}

	function registerZoomControls() {
		zoomOutButton = document.getElementById("chart_zoom_out");
		zoomResetButton = document.getElementById("chart_zoom_reset");
		zoomInButton = document.getElementById("chart_zoom_in");
		if (!zoomOutButton || !zoomResetButton || !zoomInButton) return;

		zoomOutButton.addEventListener("click", function () { changeZoom(-1); });
		zoomResetButton.addEventListener("click", resetZoom);
		zoomInButton.addEventListener("click", function () { changeZoom(1); });
		updateZoomControls();

		chartElement.addEventListener("wheel", function (event) {
			if (!resultset || event.deltaY === 0) return;
			var changed = setZoom(state.zoomLevel + (event.deltaY < 0 ? zoomStep : -zoomStep));
			if (changed) event.preventDefault();
		}, { passive: false });

		chartElement.addEventListener("touchstart", function (event) {
			if (event.touches.length !== 2) return;
			pinching = true;
			dragging = false;
			dragAngleRange = null;
			pinchStartDistance = touchDistance(event.touches);
			pinchStartZoom = state.zoomLevel;
			event.preventDefault();
		}, { passive: false });

		chartElement.addEventListener("touchmove", function (event) {
			if (!pinching || event.touches.length !== 2 || pinchStartDistance === 0) return;
			setZoom(pinchStartZoom * touchDistance(event.touches) / pinchStartDistance);
			event.preventDefault();
		}, { passive: false });

		function endPinch(event) {
			if (event.touches && event.touches.length >= 2) return;
			pinching = false;
			pinchStartDistance = 0;
		}

		chartElement.addEventListener("touchend", endPinch, { passive: true });
		chartElement.addEventListener("touchcancel", endPinch, { passive: true });
	}

	function normalizeOptions(options) {
		return (options || []).filter(Boolean).slice().sort();
	}

	function calculateData() {
		var optionsKey = state.options.join(",");
		var nextCacheKey = [state.tws, state.boatType, optionsKey].join("|");
		if (nextCacheKey !== cacheKey) {
			cacheKey = nextCacheKey;
			samples = [];
			var max = { twa: 0, speed: 0 };
			var upwind = { twa: 0, vmg: 0 };
			var downwind = { twa: 180, vmg: 0 };

			for (var index = 0; index <= 1800; index++) {
				var angle = index / 10;
				var data = PolarsReader.getSpeeds(angle, state.tws, state.boatType, state.options);
				samples.push({ angle: angle, best: data.best, all: data.all });
				if (data.best.speed > max.speed) max = { twa: angle, speed: data.best.speed };
				if (data.best.vmg > upwind.vmg) upwind = { twa: angle, vmg: data.best.vmg };
				if (data.best.vmg < downwind.vmg) downwind = { twa: angle, vmg: data.best.vmg };
			}

			resultset = {
				max: max,
				bestVMG: {
					upwind: upwind,
					downwind: { twa: downwind.twa, vmg: Math.abs(downwind.vmg) }
				},
				current: {},
				sailsSpeeds: {}
			};
		}

		var currentData = PolarsReader.getSpeeds(state.twa, state.tws, state.boatType, state.options);
		resultset.current = {
			speed: currentData.best.speed,
			vmg: Math.abs(currentData.best.vmg),
			bestSail: currentData.best.sail,
			foilFactor: currentData.best.foilFactor,
			foilRate: currentData.best.foilRate,
			__twa: state.twa,
			__tws: state.tws,
			__boatType: state.boatType,
			__options: state.options
		};
		resultset.sailsSpeeds = currentData.all;
		setScale(resultset.max.speed);
	}

	function setScale(maxSpeed) {
		var roughStep = Math.max(maxSpeed / 6, 0.1);
		var magnitude = Math.pow(10, Math.floor(Math.log(roughStep) / Math.LN10));
		var normalized = roughStep / magnitude;
		var nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
		var step = nice * magnitude;
		state.radiusMax = Math.max(step, Math.ceil((maxSpeed + 0.01) / step) * step);
		state.splitNumber = Math.max(2, Math.round(state.radiusMax / step));
	}

	function commonLine(name, color, data, extra) {
		return Object.assign({
			name: name,
			type: "line",
			coordinateSystem: "polar",
			data: data,
			showSymbol: false,
			connectNulls: false,
			silent: false,
			animationDuration: 220,
			lineStyle: { color: color, width: 2.5, cap: "round", join: "round" },
			emphasis: { lineStyle: { width: 4 } }
		}, extra || {});
	}

	function curveSeries() {
		if (state.zoomLevel > minZoom && resultset && resultset.current) {
			var activeSail = resultset.current.bestSail;
			return [commonLine(
				PolarsReader.sailsNames[activeSail].en,
				sailColors[activeSail],
				samples.map(function (sample) { return [sample.all[activeSail], sample.angle]; }),
				{
					areaStyle: { color: sailColors[activeSail], opacity: 0.035 },
					lineStyle: { color: sailColors[activeSail], width: 3, cap: "round", join: "round" }
				}
			)];
		}

		var selected = state.sailsSelected || [];
		if (selected.length) {
			return selected.map(function (sail) {
				return commonLine(
					PolarsReader.sailsNames[sail].en,
					sailColors[sail],
					samples.map(function (sample) { return [sample.all[sail], sample.angle]; }),
					{ areaStyle: { color: sailColors[sail], opacity: 0.035 } }
				);
			});
		}

		return sails.map(function (sail) {
			return commonLine(
				PolarsReader.sailsNames[sail].en,
				sailColors[sail],
				samples.map(function (sample) {
					return [sample.best.sail === sail ? sample.best.speed : null, sample.angle];
				})
			);
		});
	}

	function radialSeries(name, angle, color, dashed) {
		var radiusRange = visibleRadiusRange();
		return commonLine(name, color, [[radiusRange.min, angle], [radiusRange.max, angle]], {
			silent: true,
			tooltip: { show: false },
			animation: false,
			lineStyle: { color: color, width: name === "Current TWA" ? 2.5 : 1.4, type: dashed ? "dashed" : "solid" },
			z: name === "Current TWA" ? 8 : 4
		});
	}

	function speedArcSeries() {
		if (!state.showSpeed) return [];
		var speed = resultset.current.speed;
		var from = state.twa <= 90 ? 0 : 180;
		if (!angleIsVisible(from, visibleAngleRange())) return [];
		var direction = from <= state.twa ? 1 : -1;
		var data = [];
		for (var angle = from; direction > 0 ? angle <= state.twa : angle >= state.twa; angle += direction) {
			data.push([speed, angle]);
		}
		data.push([speed, state.twa]);
		return [commonLine("Speed projection", sailColors[resultset.current.bestSail] || "#078b86", data, {
			silent: true,
			tooltip: { show: false },
			animation: false,
			lineStyle: { color: sailColors[resultset.current.bestSail] || "#078b86", width: 1.5, type: "dashed", opacity: 0.75 },
			z: 6
		})];
	}

	function foilSeries() {
		if (!state.showFoils) return [];
		var radiusMax = visibleRadiusRange().max;
		var foilData = samples.filter(function (sample, index) {
			return index % 10 === 0 && sample.best.foilFactor > 1;
		}).map(function (sample) {
			var hue = Math.max(5, Math.min(150, -500 * sample.best.foilFactor + 560));
			return {
				value: [radiusMax * 0.995, sample.angle],
				itemStyle: { color: "hsl(" + hue + ", 78%, 48%)" }
			};
		});
		if (!foilData.length) return [];
		return [{
			name: "Foil range",
			type: "scatter",
			coordinateSystem: "polar",
			data: foilData,
			symbol: "rect",
			symbolSize: [5, 7],
			silent: true,
			animation: false,
			z: 7
		}];
	}

	function vmgSector(center, radius, startTwa, endTwa, angleRange) {
		startTwa = Math.max(startTwa, angleRange.min);
		endTwa = Math.min(endTwa, angleRange.max);
		if (startTwa >= endTwa) return null;

		function twaToCanvasAngle(twa) {
			return (displayAngle(twa, angleRange) - 90) * Math.PI / 180;
		}

		return {
			type: "sector",
			shape: {
				cx: center[0],
				cy: center[1],
				r: radius,
				r0: 0,
				startAngle: twaToCanvasAngle(startTwa),
				endAngle: twaToCanvasAngle(endTwa),
				clockwise: true
			},
			style: {
				fill: "rgba(214, 69, 69, 0.15)"
			},
			silent: true,
			z: 1
		};
	}

	function graphicOverlays() {
		var layout = chartLayout();
		var center = [layout.centerX, layout.centerY];
		var outerRadius = layout.radius;
		var angleRange = visibleAngleRange();
		var radiusRange = visibleRadiusRange();
		var angle = displayAngle(state.twa, angleRange) * Math.PI / 180;
		var radiusSpan = radiusRange.max - radiusRange.min;
		var radiusRatio = (resultset.current.speed - radiusRange.min) / radiusSpan;
		var currentRadius = outerRadius * Math.max(0, Math.min(radiusRatio, 1));
		var point = [
			center[0] + Math.sin(angle) * currentRadius,
			center[1] - Math.cos(angle) * currentRadius
		];
		var graphics = [
			vmgSector(center, outerRadius, 0, resultset.bestVMG.upwind.twa, angleRange),
			vmgSector(center, outerRadius, resultset.bestVMG.downwind.twa, 180, angleRange)
		].filter(Boolean);

		var windAxisTwa = state.twa <= 90 ? 0 : 180;
		var windAxisVisible = angleIsVisible(windAxisTwa, angleRange);
		if (state.showVMG && windAxisVisible) {
			graphics.push({
				type: "line",
				shape: { x1: center[0], y1: center[1], x2: center[0], y2: point[1] },
				style: { stroke: "#d64545", lineWidth: 4 },
				silent: true,
				z: 20
			});
			graphics.push({
				type: "line",
				shape: { x1: center[0], y1: point[1], x2: point[0], y2: point[1] },
				style: { stroke: "#d64545", lineWidth: 1.5, lineDash: [4, 4] },
				silent: true,
				z: 20
			});
		}

		if (state.showSpeed && windAxisVisible) {
			var axisY = windAxisTwa === 0 ? center[1] - currentRadius : center[1] + currentRadius;
			graphics.push({
				type: "line",
				shape: { x1: center[0], y1: center[1], x2: center[0], y2: axisY },
				style: { stroke: sailColors[resultset.current.bestSail] || "#078b86", lineWidth: 5, opacity: 0.72 },
				silent: true,
				z: 19
			});
		}
		return graphics;
	}

	function buildOption() {
		var layout = chartLayout();
		var angleRange = visibleAngleRange();
		var radiusRange = visibleRadiusRange();
		var currentDisplayAngle = displayAngle(state.twa, angleRange);
		var series = curveSeries();
		series.push(radialSeries("Best VMG upwind", resultset.bestVMG.upwind.twa, "#d64545", true));
		series.push(radialSeries("Best VMG downwind", resultset.bestVMG.downwind.twa, "#d64545", true));
		series.push(radialSeries("Maximum speed", resultset.max.twa, "#14865f", true));
		series.push(radialSeries("Current TWA", state.twa, "#1769d2", false));
		series = series.concat(speedArcSeries(), foilSeries());
		if (state.zoomLevel > minZoom) {
			series.push({
				name: "Active polar point",
				type: "scatter",
				coordinateSystem: "polar",
				data: [[resultset.current.speed, state.twa]],
				symbol: "circle",
				symbolSize: 13,
				itemStyle: {
					color: sailColors[resultset.current.bestSail] || "#078b86",
					borderColor: "#ffffff",
					borderWidth: 3,
					shadowBlur: 5,
					shadowColor: "rgba(7, 26, 43, .32)"
				},
				z: 26
			});
		}
		series.push({
			name: "Current performance",
			type: "scatter",
			coordinateSystem: "polar",
			data: [{
				value: [radiusRange.max, state.twa],
				actualSpeed: resultset.current.speed
			}],
			symbolSize: 11,
			itemStyle: { color: "#1769d2", borderColor: "#ffffff", borderWidth: 2 },
			label: {
				show: true,
				position: currentDisplayAngle > 60 && currentDisplayAngle < 120 ? "top" : "right",
				formatter: state.twa + "° · " + Number(resultset.current.speed).toFixed(2) + " kt",
				color: "#123a58",
				fontWeight: 700,
				backgroundColor: "rgba(255,255,255,.92)",
				borderColor: "#d8e2eb",
				borderWidth: 1,
				borderRadius: 5,
				padding: [4, 6]
			},
			z: 25
		});

		return {
			animation: true,
			backgroundColor: "transparent",
			aria: { enabled: true, decal: { show: false } },
			tooltip: {
				trigger: "item",
				confine: true,
				backgroundColor: "rgba(7, 26, 43, .94)",
				borderWidth: 0,
				textStyle: { color: "#ffffff" },
				formatter: function (params) {
					if (!params.value || params.value[0] === null) return "";
					var speed = params.data && params.data.actualSpeed !== undefined
						? params.data.actualSpeed
						: params.value[0];
					return params.seriesName + "<br>" + Number(params.value[1]).toFixed(1) + "° · " + Number(speed).toFixed(2) + " kt";
				}
			},
			polar: { center: [layout.centerX, layout.centerY], radius: layout.radius },
			angleAxis: {
				type: "value",
				min: angleRange.min,
				max: angleRange.max,
				startAngle: 90,
				endAngle: -90,
				clockwise: true,
				splitNumber: Math.max(6, Math.round((angleRange.max - angleRange.min) / 10)),
				axisLine: { lineStyle: { color: "#9eb0bf" } },
				axisTick: { show: false },
				axisLabel: {
					color: "#718092",
					fontSize: 10,
					formatter: function (value) { return Number(value.toFixed(1)) + "°"; }
				},
				splitLine: { lineStyle: { color: "rgba(113, 128, 146, .20)", width: 1 } }
			},
			radiusAxis: {
				type: "value",
				min: radiusRange.min,
				max: radiusRange.max,
				splitNumber: state.splitNumber,
				axisLine: { show: false },
				axisTick: { show: false },
				axisLabel: {
					color: "#718092",
					fontSize: 10,
					formatter: function (value) { return Number(value.toFixed(2)) + " kt"; }
				},
				splitLine: { lineStyle: { color: "rgba(113, 128, 146, .24)" } }
			},
			graphic: graphicOverlays(),
			series: series
		};
	}

	function render() {
		if (!chart) return;
		chart.setOption(buildOption(), { notMerge: true, lazyUpdate: false });
	}

	function chartLayout() {
		var width = chart.getWidth();
		var height = chart.getHeight();
		return {
			centerX: width * 0.13,
			centerY: height * 0.5,
			radius: Math.min(width * 0.82, height * 0.46)
		};
	}

	function pointerAngle(event) {
		var layout = chartLayout();
		var x = event.offsetX - layout.centerX;
		var y = event.offsetY - layout.centerY;
		var maxDistance = layout.radius * 1.08;
		if (Math.sqrt(x * x + y * y) > maxDistance) return null;
		var pointerDisplayAngle = Math.atan2(x, -y) * 180 / Math.PI;
		if (pointerDisplayAngle < 0) pointerDisplayAngle += 360;
		if (pointerDisplayAngle > 180) return null;
		var angleRange = visibleAngleRange();
		return Math.round(angleRange.min + pointerDisplayAngle * (angleRange.max - angleRange.min) / 180);
	}

	function emitPointerAngle(event) {
		if (!callback) return;
		var angle = pointerAngle(event);
		if (angle !== null) callback.call(chartElement, angle);
	}

	function registerPointerEvents() {
		var renderer = chart.getZr();
		renderer.on("mousedown", function (event) {
			if (pinching) return;
			dragging = true;
			dragAngleRange = calculateAngleRange();
			emitPointerAngle(event);
		});
		renderer.on("mousemove", function (event) {
			if (dragging && !pinching) emitPointerAngle(event);
		});
		function endDrag() {
			var wasDragging = dragging;
			dragging = false;
			dragAngleRange = null;
			if (wasDragging && state.zoomLevel > minZoom && resultset) render();
		}
		renderer.on("mouseup", endDrag);
		renderer.on("globalout", endDrag);
		renderer.on("dblclick", resetZoom);
	}

	function plotChart(twa, tws, boatType, options, sailsSelected) {
		if (!initChart()) return legacyChart.plotChart(twa, tws, boatType, options, sailsSelected);
		state.twa = Number(twa);
		state.tws = Number(tws);
		state.boatType = boatType;
		state.options = normalizeOptions(options);
		state.sailsSelected = sailsSelected || [];
		calculateData();
		render();
		return resultset;
	}

	function clearChart() {
		if (!chart) return legacyChart.clearChart();
		if (zoomRenderFrame !== null && typeof window.cancelAnimationFrame === "function") {
			window.cancelAnimationFrame(zoomRenderFrame);
			zoomRenderFrame = null;
		}
		state.zoomLevel = minZoom;
		dragAngleRange = null;
		updateZoomControls();
		chart.clear();
	}

	function moveTWA(twa) {
		state.twa = Number(twa);
		calculateData();
		render();
		return resultset;
	}

	function moveTWS(tws) {
		state.tws = Number(tws);
		calculateData();
		render();
		return resultset;
	}

	function showVMGOverlay(show) {
		state.showVMG = Boolean(show);
		if (chart && resultset) render();
		else legacyChart.showVMGOverlay(show);
	}

	function showBoatSpeedOverlay(show) {
		state.showSpeed = Boolean(show);
		if (chart && resultset) render();
		else legacyChart.showBoatSpeedOverlay(show);
	}

	function showFoilsOverlay(show) {
		state.showFoils = Boolean(show);
		if (chart && resultset) render();
		else legacyChart.showFoilsOverlay(show);
	}

	function registerDragNDrop(nextCallback) {
		if (typeof nextCallback !== "function") throw new TypeError("Function expected as a callback");
		callback = nextCallback;
		if (!initChart()) legacyChart.registerDragNDrop(nextCallback);
	}

	window.PolarsChart = {
		plotChart: plotChart,
		clearChart: clearChart,
		moveTWA: moveTWA,
		moveTWS: moveTWS,
		showVMGOverlay: showVMGOverlay,
		showBoatSpeedOverlay: showBoatSpeedOverlay,
		showFoilsOverlay: showFoilsOverlay,
		registerDragNDrop: registerDragNDrop
	};
})();
