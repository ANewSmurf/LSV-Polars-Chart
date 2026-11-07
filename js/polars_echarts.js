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
	var dragLayout = null;
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
		zoomLevel: 1,
		digits: 2,
		view: "polar"
	};
	var viewStorageKey = "lsv-chart-view";
	// The hint under the view selector: "hints.<view>" in locales/*.json.
	var viewHints = { polar: "hints.polar", speed: "hints.speed", vmg: "hints.vmg", map: "hints.map", gap: "hints.gap", tws: "hints.tws" };

	function t(key, params) {
		return window.I18n ? I18n.t(key, params) : key;
	}

	// Speed unit: "kt" in English, "nds" in French.
	function unit() {
		return window.I18n && I18n.has("units.knot") ? I18n.t("units.knot") : "kt";
	}
	var viewSelect = null;
	var viewHint = null;
	var gridCache = { key: "", map: [], vmg: [], tws: {} };

	function formatSpeed(speed) {
		return Number(speed).toFixed(state.digits) + " " + unit();
	}

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
			registerViewSelector();
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

	function niceStep(roughStep) {
		var magnitude = Math.pow(10, Math.floor(Math.log(roughStep) / Math.LN10));
		var normalized = roughStep / magnitude;
		var nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
		return nice * magnitude;
	}

	// Every view zooms around the active point, except the best sail map.
	function viewHasZoom() {
		return state.view !== "map";
	}

	function isZoomed() {
		return viewHasZoom() && state.zoomLevel > minZoom && resultset && resultset.current;
	}

	// Speed scale of the polar views: the Performance curve uses the active TWS
	// scale, Polars by TWS a larger one that holds every wind speed shown.
	var twsWindSpeeds = [10, 15, 20, 25];

	function twsCurveSpeeds() {
		var currentTws = Number(state.tws);
		return twsWindSpeeds.filter(function (tws) { return Math.abs(tws - currentTws) > 0.001; });
	}

	function polarScale() {
		if (state.view !== "tws") {
			return { radiusMax: state.radiusMax, step: state.radiusMax / state.splitNumber };
		}
		var maxSpeed = Math.max(resultset.max.speed, 0.1);
		twsCurveSpeeds().forEach(function (tws) {
			gridData("tws", tws).forEach(function (point) { maxSpeed = Math.max(maxSpeed, point[0]); });
		});
		var step = maxSpeed > 30 ? 10 : 5;
		return { radiusMax: Math.ceil((maxSpeed + 0.01) / step) * step, step: step };
	}

	function baseLayout() {
		var width = chart.getWidth();
		var height = chart.getHeight();
		var radius = Math.min(width * 0.82, height * 0.46);
		return {
			// Center the half disc horizontally, keeping room for the speed labels on its left.
			centerX: Math.max(width * 0.13, (width - radius) / 2),
			centerY: height * 0.5,
			radius: radius,
			zoomed: false
		};
	}

	// True magnification around the active point: the polar origin stays at 0 kt,
	// the whole chart is scaled by the zoom level and the active point keeps its
	// position on screen, so rings, angles and speed labels follow the zoom.
	function zoomedLayout() {
		var base = baseLayout();
		if (!isZoomed()) return base;
		var angle = state.twa * Math.PI / 180;
		var ratio = Math.max(0, Math.min(resultset.current.speed / polarScale().radiusMax, 1));
		var focusX = base.centerX + Math.sin(angle) * base.radius * ratio;
		var focusY = base.centerY - Math.cos(angle) * base.radius * ratio;
		var zoom = state.zoomLevel;
		return {
			centerX: focusX - zoom * (focusX - base.centerX),
			centerY: focusY - zoom * (focusY - base.centerY),
			radius: base.radius * zoom,
			zoomed: true
		};
	}

	function chartLayout() {
		// While the blue radius is dragged, the view stays still under the pointer.
		return dragLayout || zoomedLayout();
	}

	function radiusInterval() {
		var baseStep = polarScale().step;
		return isZoomed() ? niceStep(baseStep / state.zoomLevel) : baseStep;
	}

	function speedToRadius(speed, layout) {
		return layout.radius * speed / polarScale().radiusMax;
	}

	function updateZoomControls() {
		if (!zoomResetButton) return;
		var percentage = Math.round(state.zoomLevel * 100);
		zoomResetButton.textContent = percentage + "%";
		zoomResetButton.setAttribute("aria-label", t("chart.zoomResetFrom", { zoom: percentage }));
		zoomOutButton.disabled = state.zoomLevel <= minZoom + 0.001;
		zoomInButton.disabled = state.zoomLevel >= maxZoom - 0.001;
	}

	function setZoom(level) {
		var nextLevel = Math.max(minZoom, Math.min(maxZoom, Number(level) || minZoom));
		if (Math.abs(nextLevel - state.zoomLevel) < 0.001) return false;
		state.zoomLevel = nextLevel;
		if (dragLayout) dragLayout = zoomedLayout();
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
			if (!resultset || event.deltaY === 0 || !viewHasZoom()) return;
			var changed = setZoom(state.zoomLevel + (event.deltaY < 0 ? zoomStep : -zoomStep));
			if (changed) event.preventDefault();
		}, { passive: false });

		chartElement.addEventListener("touchstart", function (event) {
			if (event.touches.length !== 2 || !viewHasZoom()) return;
			pinching = true;
			dragging = false;
			dragLayout = null;
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
		var step = niceStep(Math.max(maxSpeed / 6, 0.1));
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
		if (isZoomed()) {
			var activeSail = resultset.current.bestSail;
			return [commonLine(
				PolarsReader.sailLabel(activeSail),
				sailColors[activeSail],
				samples.map(function (sample) {
					var speed = sample.all[activeSail];
					var invalidSpeed = typeof speed !== "number" || !isFinite(speed);
					return invalidSpeed ? [null, sample.angle] : [speed, sample.angle];
				}),
				{
					lineStyle: { color: sailColors[activeSail], width: 3, cap: "round", join: "round" }
				}
			)];
		}

		var selected = state.sailsSelected || [];
		if (selected.length) {
			return selected.map(function (sail) {
				return commonLine(
					PolarsReader.sailLabel(sail),
					sailColors[sail],
					samples.map(function (sample) { return [sample.all[sail], sample.angle]; }),
					{ areaStyle: { color: sailColors[sail], opacity: 0.035 } }
				);
			});
		}

		return sails.map(function (sail) {
			return commonLine(
				PolarsReader.sailLabel(sail),
				sailColors[sail],
				samples.map(function (sample) {
					return [sample.best.sail === sail ? sample.best.speed : null, sample.angle];
				})
			);
		});
	}

	function radialSeries(name, angle, color, dashed, current) {
		return commonLine(name, color, [[0, angle], [state.radiusMax, angle]], {
			silent: true,
			tooltip: { show: false },
			animation: false,
			lineStyle: { color: color, width: current ? 2.5 : 1.4, type: dashed ? "dashed" : "solid" },
			z: current ? 8 : 4
		});
	}

	function speedArcSeries() {
		if (!state.showSpeed) return [];
		var speed = resultset.current.speed;
		var from = state.twa <= 90 ? 0 : 180;
		var direction = from <= state.twa ? 1 : -1;
		var data = [];
		for (var angle = from; direction > 0 ? angle <= state.twa : angle >= state.twa; angle += direction) {
			data.push([speed, angle]);
		}
		data.push([speed, state.twa]);
		return [commonLine(t("chart.speedProjection"), sailColors[resultset.current.bestSail] || "#078b86", data, {
			silent: true,
			tooltip: { show: false },
			animation: false,
			lineStyle: { color: sailColors[resultset.current.bestSail] || "#078b86", width: 1.5, type: "dashed", opacity: 0.75 },
			z: 6
		})];
	}

	function foilSeries() {
		if (!state.showFoils) return [];
		var radiusMax = state.radiusMax;
		var foilData = samples.filter(function (sample, index) {
			// The angle axis always covers 0-180°, so the markers stay on the half disc arc.
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
			name: t("chart.foilRange"),
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

	function vmgSector(center, radius, startTwa, endTwa) {
		if (startTwa >= endTwa) return null;

		function twaToCanvasAngle(twa) {
			return (twa - 90) * Math.PI / 180;
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

	function zoomLabel(x, y, text, theme) {
		return {
			type: "text",
			x: x,
			y: y,
			style: {
				text: text,
				fill: theme.text,
				fontSize: 10,
				align: "center",
				verticalAlign: "middle",
				// The labels sit over grid lines: a light background keeps them readable.
				backgroundColor: theme.zoomLabelBackground,
				padding: [1, 3],
				borderRadius: 3
			},
			silent: true,
			z: 30
		};
	}

	// When zoomed, the axis labels drawn by ECharts sit on the 0° radius and the
	// outer arc, which are usually off screen. These labels are placed where the
	// rings and radii actually cross the visible area instead.
	function zoomLabels(layout, theme) {
		if (!layout.zoomed) return [];
		var labels = [];
		var width = chart.getWidth();
		var height = chart.getHeight();
		var margin = 14;
		var angle = state.twa * Math.PI / 180;
		var dirX = Math.sin(angle);
		var dirY = -Math.cos(angle);
		var normalX = -Math.cos(angle);
		var normalY = -Math.sin(angle);
		var currentRadius = speedToRadius(resultset.current.speed, layout);
		var interval = radiusInterval();
		var decimals = Math.abs(interval - Math.round(interval)) < 1e-6 ? 0 : Math.abs(interval * 10 - Math.round(interval * 10)) < 1e-6 ? 1 : 2;

		function inside(x, y) {
			return x >= margin && x <= width - margin && y >= margin && y <= height - margin;
		}

		// Speed labels along the current TWA radius, beside each ring it crosses.
		var radiusMax = polarScale().radiusMax;
		for (var speed = interval; speed <= radiusMax + 0.0001; speed += interval) {
			var radius = speedToRadius(speed, layout);
			if (Math.abs(radius - currentRadius) < 26) continue;
			var text = speed.toFixed(decimals) + " " + unit();
			var offset = 6 + Math.abs(normalX) * text.length * 3 + Math.abs(normalY) * 6;
			var x = layout.centerX + dirX * radius + normalX * offset;
			var y = layout.centerY + dirY * radius + normalY * offset;
			if (inside(x, y)) labels.push(zoomLabel(x, y, text, theme));
		}

		// Angle labels where each radius leaves the visible area, or on the outer arc when it is visible.
		var angleStep = state.zoomLevel >= 2 ? 5 : 10;
		var placed = [];
		for (var twa = 0; twa <= 180; twa += angleStep) {
			var a = twa * Math.PI / 180;
			var dx = Math.sin(a);
			var dy = -Math.cos(a);
			var tEnter = 0;
			var tExit = layout.radius + 14;
			[[dx, layout.centerX, margin, width - margin], [dy, layout.centerY, margin, height - margin]].forEach(function (axis) {
				var d = axis[0], origin = axis[1], low = axis[2], high = axis[3];
				if (Math.abs(d) < 1e-9) {
					if (origin < low || origin > high) tExit = -1;
					return;
				}
				var t1 = (low - origin) / d;
				var t2 = (high - origin) / d;
				tEnter = Math.max(tEnter, Math.min(t1, t2));
				tExit = Math.min(tExit, Math.max(t1, t2));
			});
			if (tExit <= tEnter || tExit < 30) continue;
			var lx = layout.centerX + dx * tExit;
			var ly = layout.centerY + dy * tExit;
			if (Math.hypot(lx - (layout.centerX + dirX * currentRadius), ly - (layout.centerY + dirY * currentRadius)) < 40) continue;
			// Radii converge near the origin: skip a label that would overlap the previous ones.
			var crowded = placed.some(function (other) {
				return Math.abs(other[0] - lx) < 34 && Math.abs(other[1] - ly) < 16;
			});
			if (crowded) continue;
			placed.push([lx, ly]);
			labels.push(zoomLabel(lx, ly, twa + "°", theme));
		}
		return labels;
	}

	function graphicOverlays(theme) {
		var layout = chartLayout();
		var center = [layout.centerX, layout.centerY];
		var outerRadius = layout.radius;
		var angle = state.twa * Math.PI / 180;
		var currentRadius = Math.min(speedToRadius(resultset.current.speed, layout), outerRadius);
		var point = [
			center[0] + Math.sin(angle) * currentRadius,
			center[1] - Math.cos(angle) * currentRadius
		];
		var graphics = [
			vmgSector(center, outerRadius, 0, resultset.bestVMG.upwind.twa),
			vmgSector(center, outerRadius, resultset.bestVMG.downwind.twa, 180)
		].filter(Boolean).concat(zoomLabels(layout, theme));

		var windAxisTwa = state.twa <= 90 ? 0 : 180;
		if (state.showVMG) {
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

		if (state.showSpeed) {
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

	function readTheme() {
		var styles = window.getComputedStyle(document.documentElement);
		var themeColor = function (name, fallback) {
			return styles.getPropertyValue(name).trim() || fallback;
		};
		return {
			axis: themeColor("--chart-axis", "#9eb0bf"),
			grid: themeColor("--chart-grid", "rgba(113, 128, 146, .24)"),
			text: themeColor("--ink-500", "#718092"),
			labelText: themeColor("--chart-label-text", "#123a58"),
			labelBackground: themeColor("--chart-label-background", "rgba(255,255,255,.92)"),
			labelBorder: themeColor("--line", "#d8e2eb"),
			tooltip: themeColor("--chart-tooltip", "rgba(7, 26, 43, .94)"),
			pointBorder: themeColor("--chart-point-border", "#ffffff"),
			pointShadow: themeColor("--chart-point-shadow", "rgba(7, 26, 43, .32)"),
			zoomLabelBackground: themeColor("--chart-zoom-label-background", "rgba(255, 255, 255, .78)")
		};
	}

	function buildOption() {
		var layout = chartLayout();
		var theme = readTheme();
		var zoomed = layout.zoomed;
		var currentLabel = {
			show: true,
			position: state.twa > 60 && state.twa < 120 ? "top" : "right",
			distance: 8,
			formatter: state.twa + "° · " + formatSpeed(resultset.current.speed),
			color: theme.labelText,
			fontWeight: 700,
			backgroundColor: theme.labelBackground,
			borderColor: theme.labelBorder,
			borderWidth: 1,
			borderRadius: 5,
			padding: [4, 6]
		};
		var series = curveSeries();
		series.push(radialSeries(t("chart.bestVmgUpwind"), resultset.bestVMG.upwind.twa, "#d64545", true));
		series.push(radialSeries(t("chart.bestVmgDownwind"), resultset.bestVMG.downwind.twa, "#d64545", true));
		series.push(radialSeries(t("chart.maxSpeed"), resultset.max.twa, "#14865f", true));
		series.push(radialSeries(t("chart.currentTwa"), state.twa, "#1769d2", false, true));
		series = series.concat(speedArcSeries(), foilSeries());
		if (zoomed) {
			series.push({
				name: t("chart.activePolarPoint"),
				type: "scatter",
				coordinateSystem: "polar",
				data: [[resultset.current.speed, state.twa]],
				symbol: "circle",
				symbolSize: 13,
				itemStyle: {
					color: sailColors[resultset.current.bestSail] || "#078b86",
					borderColor: theme.pointBorder,
					borderWidth: 3,
					shadowBlur: 5,
					shadowColor: theme.pointShadow
				},
				// The outer arc is usually off screen when zoomed: the label follows the active point.
				label: currentLabel,
				z: 26
			});
		}
		series.push({
			name: t("chart.currentPerformance"),
			type: "scatter",
			coordinateSystem: "polar",
			data: [{
				value: [state.radiusMax, state.twa],
				actualSpeed: resultset.current.speed
			}],
			symbolSize: 11,
			itemStyle: { color: "#1769d2", borderColor: theme.pointBorder, borderWidth: 2 },
			label: Object.assign({}, currentLabel, { show: !zoomed }),
			z: 25
		});

		return {
			animation: true,
			backgroundColor: "transparent",
			aria: { enabled: true, decal: { show: false } },
			tooltip: {
				trigger: "item",
				confine: true,
				backgroundColor: theme.tooltip,
				borderWidth: 0,
				textStyle: { color: "#ffffff" },
				formatter: function (params) {
					if (!params.value || params.value[0] === null) return "";
					var speed = params.data && params.data.actualSpeed !== undefined
						? params.data.actualSpeed
						: params.value[0];
					return params.seriesName + "<br>" + Number(params.value[1]).toFixed(1) + "° · " + formatSpeed(speed);
				}
			},
			polar: { center: [layout.centerX, layout.centerY], radius: layout.radius },
			angleAxis: {
				type: "value",
				min: 0,
				max: 180,
				startAngle: 90,
				endAngle: -90,
				clockwise: true,
				interval: zoomed && state.zoomLevel >= 2 ? 5 : 10,
				axisLine: { lineStyle: { color: theme.axis } },
				axisTick: { show: false },
				axisLabel: {
					show: !zoomed,
					color: theme.text,
					fontSize: 10,
					formatter: function (value) { return Number(value.toFixed(1)) + "°"; }
				},
				splitLine: { lineStyle: { color: theme.grid, width: 1 } }
			},
			radiusAxis: {
				type: "value",
				min: 0,
				max: state.radiusMax,
				interval: radiusInterval(),
				axisLine: { show: false },
				axisTick: { show: false },
				axisLabel: {
					show: !zoomed,
					color: theme.text,
					fontSize: 10,
					formatter: function (value) { return Number(value.toFixed(2)) + " " + unit(); }
				},
				splitLine: { lineStyle: { color: theme.grid } }
			},
			graphic: graphicOverlays(theme),
			series: series
		};
	}

	function render() {
		if (!chart) return;
		var option = state.view === "polar" || !window.PolarsViews
			? buildOption()
			: window.PolarsViews.build(state.view, viewContext());
		chart.setOption(option, { notMerge: true, lazyUpdate: false });
	}

	// Everything the additional chart views need, without exposing the renderer internals.
	function viewContext() {
		return {
			state: state,
			resultset: resultset,
			samples: samples,
			sailChangeTolerance: typeof PolarsReader.getSailChangeTolerance === "function" ? PolarsReader.getSailChangeTolerance() : 1.014,
			layout: chartLayout(),
			theme: readTheme(),
			scale: polarScale(),
			twsWindSpeeds: twsCurveSpeeds(),
			radiusInterval: radiusInterval(),
			zoomLabels: function (theme) { return zoomLabels(chartLayout(), theme); },
			niceStep: niceStep,
			dragging: dragging && dragLayout !== null,
			sails: sails,
			sailColors: sailColors,
			formatSpeed: formatSpeed,
			grid: gridData
		};
	}

	// Speeds over a TWA × TWS grid and for a few wind speeds, cached per boat and options.
	function gridData(kind, tws) {
		var key = [state.boatType, state.options.join(",")].join("|");
		if (gridCache.key !== key) gridCache = { key: key, map: [], vmg: [], tws: {} };
		if (kind === "map") {
			if (!gridCache.map.length) {
				for (var windSpeed = 2; windSpeed <= 40; windSpeed += 2) {
					for (var angle = 0; angle <= 180; angle += 5) {
						var best = PolarsReader.getSpeeds(angle, windSpeed, state.boatType, state.options).best;
						gridCache.map.push([angle, windSpeed, best.speed, best.sail, best.foilFactor]);
					}
				}
			}
			return gridCache.map;
		}
		if (kind === "vmg") {
			// Best VMG angles for each TWS, as [tws, upwind twa, upwind vmg, downwind twa, downwind vmg].
			if (!gridCache.vmg.length) {
				for (var vmgWind = 1; vmgWind <= 41; vmgWind += 1) {
					var up = { twa: 0, vmg: 0 };
					var down = { twa: 180, vmg: 0 };
					for (var step = 0; step <= 360; step++) {
						var vmgAngle = step / 2;
						var vmg = PolarsReader.getSpeeds(vmgAngle, vmgWind, state.boatType, state.options).best.vmg;
						if (vmg > up.vmg) up = { twa: vmgAngle, vmg: vmg };
						if (vmg < down.vmg) down = { twa: vmgAngle, vmg: vmg };
					}
					if (up.vmg > 0 && down.vmg < 0) gridCache.vmg.push([vmgWind, up.twa, up.vmg, down.twa, Math.abs(down.vmg)]);
				}
			}
			return gridCache.vmg;
		}
		if (!gridCache.tws[tws]) {
			var curve = [];
			for (var twa = 0; twa <= 180; twa += 1) {
				curve.push([PolarsReader.getSpeeds(twa, tws, state.boatType, state.options).best.speed, twa]);
			}
			gridCache.tws[tws] = curve;
		}
		return gridCache.tws[tws];
	}

	function readStoredView() {
		try {
			var stored = window.localStorage.getItem(viewStorageKey);
			return viewHints[stored] ? stored : "polar";
		} catch (error) {
			return "polar";
		}
	}

	function updateViewControls() {
		var panel = document.getElementById("chart_panel");
		if (panel) panel.classList.toggle("has-no-zoom", !viewHasZoom());
		if (viewSelect) viewSelect.value = state.view;
		if (viewHint) viewHint.textContent = t(viewHints[state.view]);
	}

	function registerViewSelector() {
		viewSelect = document.getElementById("chart_view");
		viewHint = document.getElementById("chart_hint");
		if (!viewSelect || !window.PolarsViews) return;
		state.view = readStoredView();
		updateViewControls();
		viewSelect.addEventListener("change", function () {
			state.view = viewHints[viewSelect.value] ? viewSelect.value : "polar";
			try { window.localStorage.setItem(viewStorageKey, state.view); } catch (error) { /* Not remembered. */ }
			dragLayout = null;
			updateViewControls();
			if (resultset) render();
		});
	}

	window.addEventListener("lsv-themechange", function () {
		if (chart && resultset) render();
	});

	function pointerAngle(event) {
		if (state.view !== "polar" && state.view !== "tws") {
			// Cartesian views: TWA is read on the horizontal axis.
			var pixel = [event.offsetX, event.offsetY];
			if (!chart.containPixel({ gridIndex: 0 }, pixel)) return null;
			var value = chart.convertFromPixel({ gridIndex: 0 }, pixel)[0];
			return Math.max(0, Math.min(180, Math.round(value)));
		}
		var layout = chartLayout();
		var x = event.offsetX - layout.centerX;
		var y = event.offsetY - layout.centerY;
		var maxDistance = layout.radius * 1.08;
		if (Math.sqrt(x * x + y * y) > maxDistance) return null;
		var pointerDisplayAngle = Math.atan2(x, -y) * 180 / Math.PI;
		if (pointerDisplayAngle < 0) pointerDisplayAngle += 360;
		if (pointerDisplayAngle > 180) return null;
		return Math.round(pointerDisplayAngle);
	}

	// On the best sail map the vertical axis is TWS, so the pointer moves the TWS too.
	function pointerWindSpeed(event) {
		if (state.view !== "map") return undefined;
		var value = chart.convertFromPixel({ gridIndex: 0 }, [event.offsetX, event.offsetY])[1];
		return Math.max(1, Math.min(40, Math.round(value)));
	}

	function emitPointerAngle(event) {
		if (!callback) return;
		var angle = pointerAngle(event);
		if (angle !== null) callback.call(chartElement, angle, pointerWindSpeed(event));
	}

	function registerPointerEvents() {
		var renderer = chart.getZr();
		renderer.on("mousedown", function (event) {
			if (pinching) return;
			dragging = true;
			dragLayout = resultset ? zoomedLayout() : null;
			emitPointerAngle(event);
		});
		renderer.on("mousemove", function (event) {
			if (dragging && !pinching) emitPointerAngle(event);
		});
		function endDrag() {
			var wasDragging = dragging;
			dragging = false;
			dragLayout = null;
			if (wasDragging && isZoomed()) render();
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
		dragLayout = null;
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

	function setDigits(digits) {
		var parsed = Math.round(Number(digits));
		state.digits = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 5) : 2;
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
		registerDragNDrop: registerDragNDrop,
		setDigits: setDigits
	};
})();
