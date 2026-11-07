/*
 * Additional chart views for the ECharts renderer: speed by TWA, VMG by TWA,
 * best sail map (TWA × TWS), gap to the best sail and polars by TWS.
 *
 * polars_echarts.js keeps the default "Performance curve" and calls
 * PolarsViews.build(view, context) for the other views. The context carries the
 * computed samples, the current result, the theme colors and a cached grid of
 * speeds, so this file only builds ECharts options.
 */
(function () {
	"use strict";

	var activeBlue = "#1769d2";

	function sailName(sail) {
		var names = window.PolarsReader && PolarsReader.sailsNames[sail];
		return names ? names.en : sail;
	}

	// Sails the boat may use with the current options, as PolarsReader picks the best one.
	function availableSails(ctx) {
		var options = ctx.state.options || [];
		return ctx.sails.filter(function (sail) {
			if (sail === "Jib" || sail === "Spi") return true;
			if (sail === "Staysail" || sail === "HeavyGnk") return options.indexOf("heavy") >= 0;
			if (sail === "LightJib" || sail === "LightGnk") return options.indexOf("light") >= 0;
			if (sail === "Code0") return options.indexOf("reach") >= 0;
			return false;
		});
	}

	function baseOption(ctx) {
		var theme = ctx.theme;
		return {
			animation: false,
			backgroundColor: "transparent",
			aria: { enabled: true, decal: { show: false } },
			textStyle: { color: theme.text },
			tooltip: {
				trigger: "axis",
				confine: true,
				backgroundColor: theme.tooltip,
				borderWidth: 0,
				textStyle: { color: "#ffffff" },
				axisPointer: { type: "line", lineStyle: { color: theme.axis } }
			},
			legend: {
				top: 6,
				right: 8,
				itemWidth: 14,
				itemHeight: 8,
				selectedMode: false,
				textStyle: { color: theme.text, fontSize: 10 }
			},
			grid: { left: 52, right: 20, top: 74, bottom: 46 },
			series: []
		};
	}

	function twaAxis(ctx) {
		var theme = ctx.theme;
		return {
			type: "value",
			min: 0,
			max: 180,
			interval: 15,
			name: "TWA",
			nameLocation: "middle",
			nameGap: 26,
			nameTextStyle: { color: theme.text, fontSize: 11 },
			axisLine: { lineStyle: { color: theme.axis } },
			axisTick: { show: false },
			axisLabel: { color: theme.text, fontSize: 10, formatter: "{value}°" },
			splitLine: { lineStyle: { color: theme.grid } }
		};
	}

	function valueAxis(ctx, name, extra) {
		var theme = ctx.theme;
		return Object.assign({
			type: "value",
			name: name,
			nameTextStyle: { color: theme.text, fontSize: 11, align: "left" },
			axisLine: { show: false },
			axisTick: { show: false },
			axisLabel: { color: theme.text, fontSize: 10 },
			splitLine: { lineStyle: { color: theme.grid } }
		}, extra || {});
	}

	function currentLabel(ctx, text) {
		var theme = ctx.theme;
		return {
			show: true,
			position: "end",
			formatter: text,
			color: theme.labelText,
			fontWeight: 700,
			backgroundColor: theme.labelBackground,
			borderColor: theme.labelBorder,
			borderWidth: 1,
			borderRadius: 5,
			padding: [4, 6]
		};
	}

	// The blue vertical line marks the active TWA, like the blue radius of the polar.
	function currentTwaSeries(ctx, labelText) {
		var label = labelText ? currentLabel(ctx, labelText) : { show: false };
		return {
			name: "Current TWA",
			type: "line",
			data: [],
			silent: true,
			markLine: {
				symbol: "none",
				silent: true,
				animation: false,
				lineStyle: { color: activeBlue, width: 2.5, type: "solid" },
				label: label,
				data: [{ xAxis: ctx.state.twa }]
			}
		};
	}

	function activePointSeries(ctx, value, labelText) {
		var theme = ctx.theme;
		return {
			name: "Active point",
			type: "scatter",
			data: [value],
			symbolSize: 13,
			silent: true,
			tooltip: { show: false },
			itemStyle: {
				color: ctx.sailColors[ctx.resultset.current.bestSail] || activeBlue,
				borderColor: theme.pointBorder,
				borderWidth: 3,
				shadowBlur: 5,
				shadowColor: theme.pointShadow
			},
			label: Object.assign(currentLabel(ctx, labelText || ""), {
				show: Boolean(labelText),
				position: ctx.state.twa > 150 ? "left" : "right",
				distance: 10
			}),
			z: 10
		};
	}

	function axisTooltip(ctx, formatValue) {
		return function (params) {
			var list = [].concat(params).filter(function (item) {
				return item.value && item.value[1] !== null && item.value[1] !== undefined && item.seriesName !== "Active point";
			});
			if (!list.length) return "";
			var lines = [Number(list[0].value[0]).toFixed(1) + "°"];
			list.forEach(function (item) {
				lines.push(item.marker + item.seriesName + " · " + formatValue(item.value[1]));
			});
			return lines.join("<br>");
		};
	}

	function speedView(ctx) {
		var option = baseOption(ctx);
		var current = ctx.resultset.current;
		var selected = ctx.state.sailsSelected || [];
		option.xAxis = twaAxis(ctx);
		option.yAxis = valueAxis(ctx, "Boat speed (kt)", { min: 0 });
		option.tooltip.formatter = axisTooltip(ctx, ctx.formatSpeed);
		var shown = selected.length ? selected : ctx.sails;
		option.series = shown.map(function (sail) {
			return {
				name: sailName(sail),
				type: "line",
				showSymbol: false,
				connectNulls: false,
				lineStyle: { color: ctx.sailColors[sail], width: 2.5 },
				itemStyle: { color: ctx.sailColors[sail] },
				data: ctx.samples.filter(function (sample, index) { return index % 5 === 0; }).map(function (sample) {
					var speed = selected.length ? sample.all[sail] : (sample.best.sail === sail ? sample.best.speed : null);
					return [sample.angle, typeof speed === "number" && isFinite(speed) ? speed : null];
				})
			};
		}).filter(function (series) {
			return series.data.some(function (point) { return point[1] !== null; });
		});
		option.series.push(currentTwaSeries(ctx));
		option.series.push(activePointSeries(ctx, [ctx.state.twa, current.speed], ctx.state.twa + "° · " + ctx.formatSpeed(current.speed)));
		option.zoomCenter = current.speed;
		return option;
	}

	function vmgView(ctx) {
		var option = baseOption(ctx);
		var theme = ctx.theme;
		var best = ctx.resultset.bestVMG;
		var signedVmg = function (twa) {
			var sample = ctx.samples[Math.round(twa * 10)];
			return sample ? sample.best.vmg : 0;
		};
		option.legend.show = false;
		option.xAxis = twaAxis(ctx);
		option.yAxis = valueAxis(ctx, "VMG (kt)");
		option.tooltip.formatter = axisTooltip(ctx, ctx.formatSpeed);
		option.series = [{
			name: "VMG",
			type: "line",
			showSymbol: false,
			lineStyle: { color: activeBlue, width: 2.5 },
			itemStyle: { color: activeBlue },
			areaStyle: { color: "rgba(23, 105, 210, 0.1)" },
			data: ctx.samples.filter(function (sample, index) { return index % 5 === 0; }).map(function (sample) {
				return [sample.angle, sample.best.vmg];
			}),
			markLine: {
				symbol: "none",
				silent: true,
				label: { show: false },
				lineStyle: { color: theme.axis, type: "solid", width: 1 },
				data: [{ yAxis: 0 }]
			},
			markPoint: {
				symbol: "circle",
				symbolSize: 11,
				silent: true,
				itemStyle: { color: "#d64545", borderColor: theme.pointBorder, borderWidth: 2 },
				label: { color: "#d64545", fontWeight: 700, fontSize: 11, formatter: function (params) { return params.name; } },
				data: [
					{
						name: "Upwind " + best.upwind.twa + "° · " + ctx.formatSpeed(best.upwind.vmg),
						coord: [best.upwind.twa, signedVmg(best.upwind.twa)],
						label: { position: "top", distance: 8 }
					},
					{
						name: "Downwind " + best.downwind.twa + "° · " + ctx.formatSpeed(best.downwind.vmg),
						coord: [best.downwind.twa, signedVmg(best.downwind.twa)],
						label: { position: "bottom", distance: 8 }
					}
				]
			}
		}];
		var currentVmg = signedVmg(ctx.state.twa);
		option.series.push(currentTwaSeries(ctx));
		option.series.push(activePointSeries(ctx, [ctx.state.twa, currentVmg], ctx.state.twa + "° · VMG " + ctx.formatSpeed(Math.abs(currentVmg))));
		option.zoomCenter = currentVmg;
		return option;
	}

	function mapView(ctx) {
		var option = baseOption(ctx);
		var theme = ctx.theme;
		var cells = ctx.grid("map");
		var maxSpeed = cells.reduce(function (max, cell) { return Math.max(max, cell[2]); }, 0.1);
		option.xAxis = twaAxis(ctx);
		option.xAxis.splitLine = { show: false };
		option.yAxis = valueAxis(ctx, "TWS (kt)", {
			min: 0,
			max: 41,
			interval: 5,
			splitLine: { show: false },
			axisLabel: { color: theme.text, fontSize: 10, formatter: function (value) { return value > 40 ? "" : value; } }
		});
		option.tooltip = {
			trigger: "item",
			confine: true,
			backgroundColor: theme.tooltip,
			borderWidth: 0,
			textStyle: { color: "#ffffff" },
			formatter: function (params) {
				if (!params.value || params.value.length < 4) return "";
				var value = params.value;
				return value[0] + "° · TWS " + value[1] + " kt<br>" + params.marker + (value[2] > 0 && value[3] ? sailName(value[3]) + " · " + ctx.formatSpeed(value[2]) : "No speed")
					+ (ctx.state.showFoils && value[4] > 1.001 ? "<br>Foils active" : "");
			}
		};
		var usable = availableSails(ctx);
		var noSpeedColor = theme.grid;
		var foilColor = "#e8c419";
		// The foil outline and its legend entry follow the foils overlay checkbox.
		var showFoils = ctx.state.showFoils;
		// Cells where the polar gives 0 kt have no best sail: they are drawn in a neutral color.
		var groups = usable.map(function (sail) {
			return { name: sailName(sail), color: ctx.sailColors[sail], opacity: true, test: function (cell) { return cell[3] === sail; } };
		});
		groups.push({
			name: "No speed",
			color: noSpeedColor,
			opacity: false,
			test: function (cell) { return !(cell[2] > 0) || usable.indexOf(cell[3]) < 0; }
		});
		option.series = groups.map(function (group) {
			return {
				name: group.name,
				type: "custom",
				clip: true,
				itemStyle: { color: group.color },
				data: cells.filter(group.test),
				renderItem: function (params, api) {
					var twa = api.value(0);
					var tws = api.value(1);
					var start = api.coord([twa - 2.5, tws + 1]);
					var end = api.coord([twa + 2.5, tws - 1]);
					var foiling = showFoils && api.value(4) > 1.001;
					return {
						type: "rect",
						shape: { x: start[0], y: start[1], width: end[0] - start[0] + 0.5, height: end[1] - start[1] + 0.5 },
						style: {
							fill: group.color,
							opacity: group.opacity ? 0.25 + 0.75 * api.value(2) / maxSpeed : 1,
							stroke: foiling ? foilColor : null,
							lineWidth: foiling ? 1 : 0
						}
					};
				}
			};
		}).filter(function (series) { return series.data.length; });
		// The foil outline has its own legend entry. This series has no data and only draws its legend icon.
		if (showFoils && cells.some(function (cell) { return cell[4] > 1.001; })) {
			option.series.push({
				name: "Foils active",
				type: "custom",
				data: [],
				itemStyle: { color: "transparent", borderColor: foilColor, borderWidth: 1.5 },
				renderItem: function () { return null; }
			});
		}
		option.series.push(currentTwaSeries(ctx));
		option.series.push(activePointSeries(ctx, [ctx.state.twa, ctx.state.tws], ctx.state.twa + "° · TWS " + ctx.state.tws + " kt"));
		option.series[option.series.length - 1].itemStyle.color = activeBlue;
		return option;
	}

	function gapView(ctx) {
		var option = baseOption(ctx);
		var usable = availableSails(ctx);
		var floor = -20;
		var rows = ctx.samples.filter(function (sample, index) { return index % 5 === 0; });
		option.xAxis = twaAxis(ctx);
		option.yAxis = valueAxis(ctx, "Gap (%)", { min: floor, max: 0 });
		option.tooltip.formatter = axisTooltip(ctx, function (value) { return Number(value).toFixed(1) + " %"; });
		option.series = usable.map(function (sail) {
			return {
				name: sailName(sail),
				type: "line",
				showSymbol: false,
				connectNulls: false,
				lineStyle: { color: ctx.sailColors[sail], width: 2.2 },
				itemStyle: { color: ctx.sailColors[sail] },
				data: rows.map(function (sample) {
					var best = Math.max.apply(null, usable.map(function (other) { return sample.all[other] || 0; }));
					var speed = sample.all[sail];
					if (!(speed > 0) || !(best > 0)) return [sample.angle, null];
					var gap = (speed / best - 1) * 100;
					return [sample.angle, gap >= floor ? gap : null];
				})
			};
		});
		option.series.push(currentTwaSeries(ctx, ctx.state.twa + "° · " + sailName(ctx.resultset.current.bestSail)));
		option.zoomCenter = 0;
		return option;
	}

	function twsView(ctx) {
		var theme = ctx.theme;
		var layout = ctx.layout;
		var currentTws = Number(ctx.state.tws);
		var curves = ctx.twsWindSpeeds.map(function (tws) { return { tws: tws, data: ctx.grid("tws", tws) }; });
		var radiusMax = ctx.scale.radiusMax;
		var zoomed = layout.zoomed;

		var series = curves.map(function (curve, index) {
			return {
				name: "TWS " + curve.tws + " kt",
				type: "line",
				coordinateSystem: "polar",
				showSymbol: false,
				silent: true,
				lineStyle: { color: theme.text, width: 1.6, opacity: 0.35 + 0.15 * index },
				itemStyle: { color: theme.text, opacity: 0.35 + 0.15 * index },
				data: curve.data
			};
		});
		series.push({
			name: "TWS " + currentTws + " kt (current)",
			type: "line",
			coordinateSystem: "polar",
			showSymbol: false,
			lineStyle: { color: activeBlue, width: 3 },
			itemStyle: { color: activeBlue },
			data: ctx.samples.filter(function (sample, index) { return index % 10 === 0; }).map(function (sample) {
				return [sample.best.speed, sample.angle];
			}),
			z: 5
		});
		series.push({
			name: "Current TWA",
			type: "line",
			coordinateSystem: "polar",
			showSymbol: false,
			silent: true,
			tooltip: { show: false },
			lineStyle: { color: activeBlue, width: 2, type: "dashed" },
			data: [[0, ctx.state.twa], [radiusMax, ctx.state.twa]],
			z: 6
		});
		series.push({
			name: "Active point",
			type: "scatter",
			coordinateSystem: "polar",
			data: [[ctx.resultset.current.speed, ctx.state.twa]],
			symbolSize: 13,
			silent: true,
			tooltip: { show: false },
			itemStyle: {
				color: ctx.sailColors[ctx.resultset.current.bestSail] || activeBlue,
				borderColor: theme.pointBorder,
				borderWidth: 3
			},
			label: Object.assign(currentLabel(ctx, ctx.state.twa + "° · " + ctx.formatSpeed(ctx.resultset.current.speed)), {
				position: "right",
				distance: 8
			}),
			z: 10
		});

		return {
			animation: false,
			backgroundColor: "transparent",
			aria: { enabled: true, decal: { show: false } },
			tooltip: {
				trigger: "item",
				confine: true,
				backgroundColor: theme.tooltip,
				borderWidth: 0,
				textStyle: { color: "#ffffff" },
				formatter: function (params) {
					if (!params.value) return "";
					return params.seriesName + "<br>" + Number(params.value[1]).toFixed(0) + "° · " + ctx.formatSpeed(params.value[0]);
				}
			},
			// The top right corner stays outside the half disc, so legend clicks never move the TWA.
			legend: {
				top: 8,
				right: 8,
				orient: "vertical",
				// Keeps the legend readable over the zoomed grid.
				backgroundColor: theme.labelBackground,
				borderColor: theme.labelBorder,
				borderWidth: 1,
				borderRadius: 6,
				padding: [6, 8],
				z: 40,
				itemWidth: 14,
				itemHeight: 8,
				selectedMode: false,
				textStyle: { color: theme.text, fontSize: 10 }
			},
			polar: { center: [layout.centerX, layout.centerY], radius: layout.radius },
			// When zoomed, the axis labels are drawn where rings and radii cross the visible area.
			graphic: ctx.zoomLabels(theme),
			angleAxis: {
				type: "value",
				min: 0,
				max: 180,
				startAngle: 90,
				endAngle: -90,
				clockwise: true,
				interval: zoomed && ctx.state.zoomLevel >= 2 ? 5 : 10,
				axisLine: { lineStyle: { color: theme.axis } },
				axisTick: { show: false },
				axisLabel: { show: !zoomed, color: theme.text, fontSize: 10, formatter: "{value}°" },
				splitLine: { lineStyle: { color: theme.grid } }
			},
			radiusAxis: {
				type: "value",
				min: 0,
				max: radiusMax,
				interval: ctx.radiusInterval,
				axisLine: { show: false },
				axisTick: { show: false },
				axisLabel: { show: !zoomed, color: theme.text, fontSize: 10, formatter: "{value} kt" },
				splitLine: { lineStyle: { color: theme.grid } }
			},
			series: series
		};
	}

	// Zoomed cartesian views: both axes narrow around the active point, like the polar zoom.
	var lastWindow = null;

	// The zoomed window edges are not round values: graduations stay on round
	// multiples of the step instead of starting from the window edge.
	function roundTicks(axis) {
		var values = [];
		var step = axis.interval;
		for (var value = Math.ceil(axis.min / step - 1e-9) * step; value <= axis.max + 1e-9; value += step) {
			values.push(Number(value.toFixed(6)));
		}
		axis.axisLabel = Object.assign({}, axis.axisLabel, { customValues: values });
		axis.axisTick = Object.assign({}, axis.axisTick, { customValues: values });
		axis.splitLine = Object.assign({}, axis.splitLine, { customValues: values });
	}

	function hideEdgeLabels(option) {
		roundTicks(option.xAxis);
		roundTicks(option.yAxis);
	}

	function zoomAxes(option, ctx, view) {
		var zoom = ctx.state.zoomLevel;
		if (!(zoom > 1) || option.zoomCenter === undefined) {
			lastWindow = null;
			return;
		}
		// While the TWA is dragged, the window stays still under the pointer.
		if (ctx.dragging && lastWindow && lastWindow.view === view && lastWindow.zoom === zoom) {
			Object.assign(option.xAxis, lastWindow.x);
			Object.assign(option.yAxis, lastWindow.y);
			hideEdgeLabels(option);
			return;
		}

		// The window is centered on the active point. It only shifts where it would
		// leave the TWA range or a fixed bound of the value axis (0 kt, 0 % gap).
		var xSpan = 180 / zoom;
		var xStep = xSpan > 60 ? 10 : 5;
		var xMin = Math.max(0, Math.min(180 - xSpan, ctx.state.twa - xSpan / 2));
		var xMax = xMin + xSpan;
		Object.assign(option.xAxis, { min: xMin, max: xMax, interval: xStep });

		var low = Infinity;
		var high = -Infinity;
		option.series.forEach(function (series) {
			if (series.type !== "line") return;
			series.data.forEach(function (point) {
				if (point[1] === null || point[1] === undefined) return;
				low = Math.min(low, point[1]);
				high = Math.max(high, point[1]);
			});
		});
		var fixedMin = option.yAxis.min;
		var fixedMax = option.yAxis.max;
		if (fixedMin !== undefined) low = fixedMin;
		if (fixedMax !== undefined) high = fixedMax;
		if (!isFinite(low) || !isFinite(high) || high <= low) return;

		var ySpan = (high - low) / zoom;
		var yStep = ctx.niceStep(ySpan / 5);
		var yMin = option.zoomCenter - ySpan / 2;
		if (fixedMax !== undefined) yMin = Math.min(yMin, fixedMax - ySpan);
		if (fixedMin !== undefined) yMin = Math.max(yMin, fixedMin);
		var yMax = yMin + ySpan;
		Object.assign(option.yAxis, { min: yMin, max: yMax, interval: yStep });
		hideEdgeLabels(option);
		lastWindow = {
			view: view,
			zoom: zoom,
			x: { min: xMin, max: xMax, interval: xStep },
			y: { min: yMin, max: yMax, interval: yStep }
		};

		// Optimum markers outside the zoomed window would be drawn over the axes.
		option.series.forEach(function (series) {
			if (!series.markPoint) return;
			series.markPoint.data = series.markPoint.data.filter(function (point) {
				return point.coord[0] >= xMin && point.coord[0] <= xMax && point.coord[1] >= yMin && point.coord[1] <= yMax;
			});
		});
	}

	var builders = { speed: speedView, vmg: vmgView, map: mapView, gap: gapView, tws: twsView };
	var markerSeries = ["Current TWA", "Active point"];

	window.PolarsViews = {
		build: function (view, ctx) {
			var option = (builders[view] || speedView)(ctx);
			zoomAxes(option, ctx, view);
			delete option.zoomCenter;
			// The legend lists the curves only, not the TWA line and the active point.
			if (option.legend) {
				option.legend.data = option.series.map(function (series) { return series.name; }).filter(function (name) {
					return markerSeries.indexOf(name) < 0;
				});
			}
			return option;
		}
	};
})();
