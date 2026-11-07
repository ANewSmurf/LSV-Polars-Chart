
//= On DOM Ready ==================//
// Starts once the page is translated (js/i18n.js), so the texts built here use I18n.t().
I18n.ready(function() {
	//Adding a .fix() Method to the Number class
	Number.prototype.fix = function(n, pad) {
		if (pad === undefined) pad = false;

		if (pad === true)
			return this.toFixed(n ? n : 2);
		else
			return Number.parseFloat(this.toFixed(n ? n : 2));
	};

	//Starts Application
	Generator.initialize();
});
//=================================//

var Generator = (function(){
	var _version		= "2.3.7";
	var _bInitialized	= false;
	var _bError			= false;
	var _bShowAsArray	= true;
	var _bCSVGenerated	= false;
	var _bShowInput		= true;
	var _nbFixDigits	= 5;

	var _polars			= {};
	var _boats			= null;
	var _matrix			= [];
	var _twa			= [];
	var _tws			= [];


	function getVersion() {
		return _version;
	}
	function initialize() {
		//Event Handlers Registration
		registerEventHandlers();

		//Sets UI Elements default state.
		$("#app_version").text(_version);
		setInfoMessage(I18n.t("generator.intro"));
		$("#info_showinput").click(function(){ showInputField(true); });
		$("#info_showlist" ).click(function(e){ e.stopPropagation(); showPolarsListField(); });

		showPolarsListField();
	}
	function setErrorMessage(msg) {
		if (!msg) return;
		$("#msg_output").removeClass().addClass("error").show().text(msg);
		$("#csv_array").hide();
	}
	function setInfoMessage(msg) {
		if (!msg) return;
		$("#msg_output").removeClass().addClass("info").html(msg);
	}
	function setCSVMessage(msg) {
		clearOutput();
		if (!msg) return;
		$("#csv_output").show().val(msg);
	}
	function clearOutput() {
		//Clears Output Field
		//$("#msg_output").removeClass().empty();
		_bCSVGenerated = false;
		$("#csv_output").val("").hide();
		$("#csv_array").empty().hide();
	}
	function readInput() {
		setInfoMessage(I18n.t("generator.reading"));
		clearOutput();

		$("#raw_input").scrollTop(0);

		_polars = {};
		try {
			var input = JSON.parse( $("#raw_input").val() );
			// var input = JSON.stringify(JSON.parse( $("#raw_input").val() ), null, 2);

			if (input.scriptData) {
				if (!input.scriptData.polar || !input.scriptData.polar.sail)
					throw new EvalError(I18n.t("generator.missingSails"));
				_polars = input.scriptData.polar;
			}
			else if (input.label) {
				if (!input.sail)
					throw new EvalError(I18n.t("generator.missingSails"));
				_polars = input;
			}
			else {
				throw new EvalError(I18n.t("generator.unknownObject"));
			}

			$.map(_polars.sail, function(sail) {
				sail.name = PolarsReader.sailsNames[sail.name].actualId;
			});

			buildSailsList();
			buildOptionsList();
			printReadout();

			setInfoMessage(I18n.t("generator.readComplete"));
			hideInputField();
			showControls();
		}
		catch(e) {
			if ($("#raw_input").val() === "")
				e = new EvalError(I18n.t("generator.emptyInput"));
			setErrorMessage(e);
			showInputField(true);
			hideControls();
		}
	}
	function showControls() {
		$("#process_data").prop("disabled", false);
		$("#hidding_ctrls_wrapper")
			.animate(
				{height : $("#wrapped_content").height() + 10},
				400,
				"swing",
				function(){ $("#hidding_ctrls_wrapper").height("auto"); });
	}
	function hideControls() {
		$("#process_data").prop("disabled", true);
		if ($("#hidding_ctrls_wrapper").height() === 0) return;
		$("#hidding_ctrls_wrapper").height( $("#wrapped_content").height() + 10 );
		$("#hidding_ctrls_wrapper")
			.animate(
				{height : 0},
				400,
				"swing");
	}
	function showInputField(bSetFocus) {
		if ($("#hidding_input_wrapper").height() !== 0) {
			if (bSetFocus) $("#raw_input").focus();
			return;
		}

		_bShowInput = true;
		$("#toggle_input").text("-");
		$("#hidding_input_wrapper")
			.show().css("height", 0)
			.animate(
				{height : "300px"},
				400,
				"swing",
				function(){ if (bSetFocus) $("#raw_input").focus(); }
			);
	}
	function hideInputField() {
		if ($("#hidding_input_wrapper").height() === 0) return;

		_bShowInput = false;
		$("#toggle_input").text("+");
		$("#hidding_input_wrapper")
			.animate(
				{height : "0"},
				400,
				"swing",
				function(){ $("#hidding_input_wrapper").css( {"display":"none"}); });
	}
	function showPolarsListField() {
		showInputField();

		if (_boats === null) {
			$("#boats_list")
				.empty()
				.append($("<option disabled></option>").text(I18n.t("generator.loading")))
				.val("")
				.show();

			$.ajax({
				cache	: false,
				dataType: "json",
				url		: "https://vro.civis.net/LSV-Dash/api?context=api&context_type=boats",
				success	: function(data){
					_boats = data.boats;
					$("#boats_list").empty();

					for (var x in _boats) {
						var boat = _boats[x];
						if (boat.id === 'unknown') continue;

						if (boat.id.substr(0, 5) === "mono/") {
							if ($("#boats_list .mono").length === 0)
								$("#boats_list").append(
									$("<optgroup class='mono'></optgroup>").attr("label", I18n.t("generator.monohulls")));
							$("#boats_list .mono").append("<option value='" + escapeHtml(boat.id) + "'>" + escapeHtml(boat.name) + "</option>");
						}
						else if (boat.id.substr(0, 6) === "multi/") {
							if ($("#boats_list .multi").length === 0)
								$("#boats_list").append(
									"<option disabled value='-'>&nbsp;</option>",
									$("<optgroup class='multi'></optgroup>").attr("label", I18n.t("generator.multihulls")));
							$("#boats_list .multi").append("<option value='" + escapeHtml(boat.id) + "'>" + escapeHtml(boat.name) + "</option>");
						}
						else {
							if ($("#boats_list .other").length === 0)
								$("#boats_list").append(
									"<option disabled value='-'>&nbsp;</option>",
									$("<optgroup class='other'></optgroup>").attr("label", I18n.t("generator.otherBoats")));
							$("#boats_list .other").append("<option value='" + escapeHtml(boat.id) + "'>" + escapeHtml(boat.name) + "</option>");
						}
					}
				},
				error	: function(xhr, status, err){
					setErrorMessage(I18n.t("generator.boatsUnavailable"));
					$("#boats_list").append($("<option disabled></option>").text(I18n.t("generator.unavailable")));
				}
			});
		}
		else {
			$("#boats_list").val("").show();
		}

		$(document).one("click", function(){
			$("#boats_list").hide();

			var polar_name = $("#boats_list").val();
			if (polar_name === null) return;

			setInfoMessage(I18n.t("generator.boatSelected", { boat: escapeHtml(polar_name) }));
			loadRawPolar(polar_name);
		});
	}
	function loadRawPolar(boatType) {
		$.ajax({
			cache	: false,
			dataType: "json",
      			url	: "https://vro.civis.net/LSV-Dash/api?context=api&context_type=polars&boatType=" + encodeURIComponent(boatType),
			success	: function(data, status, xhr){
				// $("#raw_input").val(xhr.responseText);
				$("#raw_input").val(JSON.stringify(JSON.parse(xhr.responseText),null,2));
				readInput();
			},
			error	: function(xhr, status, err){
				$("#raw_input").val("");
				showPolarsListField();
				setErrorMessage(I18n.t("messages.polarUnavailable", { boat: boatType, error: err }));
			}
		});
	}
	function buildSailsList() {
		///$("#sails_list").show();
		$("#sails_list .tab .content").empty();

		for (var sailObj in _polars.sail) {
			var sail = _polars.sail[sailObj];
			$("#sails_list .tab .content")
				.append(
					"<input type='checkbox' class='sail' id='" + sail.name + "' />" +
					"<label for='" + sail.name + "''>" + PolarsReader.sailLabel(sail.name) + "</label>");
		}
	}
	function buildOptionsList() {
		$("#boat_options.tab .content")
			.off()
			.empty()
			.append("<input type='checkbox' class='opt' id='foil' " + (!_polars.foil ? "disabled" : "") + "/>")
			.append("<label for='foil'>" + PolarsReader.optionLabel("foil") + "</label>");

		$("#boat_options.tab .content")
			.append("<input type='checkbox' class='opt' id='hull' " + (!_polars.hull ? "disabled" : "") + "/>")
			.append("<label for='hull'>" + PolarsReader.optionLabel("hull") + "</label>");

		$("#boat_options.tab .content")
			.append("<div class='br'></div>")
			.append($("<input type='button' class='genopt bigBlueButton' id='opt_chknone' />").val(I18n.t("generator.starterPack")))
			.append($("<input type='button' class='genopt bigBlueButton' id='opt_chkall' />").val(I18n.t("generator.fullPack")));

		$("#opt_chknone").click(function(){
			$("#process_controls input[type=checkbox]:not(.genopt)")
				.prop("checked", false);
			$("#Jib, #Spi")
				.prop("checked", true);

			processInput();
		});

		$("#opt_chkall").click(function(){
			$("#process_controls input[type=checkbox]:not(.genopt):not([disabled])")
				.prop("checked", true);
				processInput();
		});

		$("#process_controls input[type=checkbox],"
		+ "#process_controls input[type=radio]").click(function(){
			processInput();
		});
	}
	function printReadout() {
		$("#polars_readout")
			///.css("display", "grid")
			.empty()
			.append(""
				+ "<div>"
				+	"<span>&nbsp;" + escapeHtml(I18n.t("generator.boatType")) + "</span>"
				+	"<span class='reply'><span class='val'>" + escapeHtml(_polars.label) + "</span></span>"
				+ "</div>"
				+ "<div>"
				+	"<span>&nbsp;" + escapeHtml(I18n.t("generator.globalSpeedRatio")) + "</span>"
				+	"<span class='reply'>"
				+	(!_polars.globalSpeedRatio
						? "<span class='err'>" + escapeHtml(I18n.t("generator.unknown")) + "</span>"
						: "<span class='val'>" + escapeHtml(_polars.globalSpeedRatio) + "</span>" )
				+	"</span>"
				+ "</div>"
				+ "<div>"
				+	"<span>&nbsp;" + escapeHtml(PolarsReader.optionLabel("foil")) + "</span>"
				+	"<span class='reply'>"
				+	(!_polars.foil
						? "<span class='err'>" + escapeHtml(I18n.t("generator.unknown")) + "</span>"
						: "<span class='val'>[" + escapeHtml(_polars.foil.twaMin) + "°&ndash;" + escapeHtml(_polars.foil.twaMax) + "°] (&pm;" + escapeHtml(_polars.foil.twaMerge) + "°)</span>"
				+		  " / "
				+		  "<span class='val'>[" + escapeHtml(_polars.foil.twsMin) + "kts&ndash;" + escapeHtml(_polars.foil.twsMax) + "kts] (&pm;" + escapeHtml(_polars.foil.twsMerge) + "kts)</span>"
				+		  " / "
				+		  "<span class='val'>x" + escapeHtml(_polars.foil.speedRatio) + "</span>" )
				+	"</span>"
				+ "</div>"
				+ "<div>"
				+	"<span>&nbsp;" + escapeHtml(PolarsReader.optionLabel("hull")) + "</span>"
				+	"<span class='reply'>"
				+	(!_polars.hull
						? "<span class='err'>" + escapeHtml(I18n.t("generator.unknown")) + "</span>"
						: "<span class='val'>x" + escapeHtml(_polars.hull.speedRatio) + "</span>" )
				+	"</span>"
				+ "</div>"
			);
	}
	function processInput() {
		$("#opt_copycsv").prop("disabled", true);
		setInfoMessage(I18n.t("generator.processing"));

		try {
			aggregatesBestSails();
			applyOptions();
			printContent();

			if (_bShowAsArray) {
				$("#csv_output").hide();
				$("#csv_array").show();
			}
			else {
				$("#csv_output").show();
				$("#csv_array").hide();
			}

			_bCSVGenerated = true;
			var fileName = $("#process_controls input[name=out_format]:checked").data("filename");
			setInfoMessage(I18n.t("generator.generated", { file: "<b style='color:#bd0000;'>" + fileName + "</b>" }));
			$("#opt_array, #opt_copycsv").prop("disabled", false);
		}
		catch(e) {
			$("#opt_array, #opt_copycsv").prop("disabled", true);
			clearOutput();
			setErrorMessage(e);
		}
	}
	function aggregatesBestSails() {
		//Detects sails selection
		var sailsSelected = $("#sails_list input[type=checkbox]:checked")
			.map(function(){ return this.id;})
			.get();
		if (sailsSelected.length === 0) {
			throw new EvalError(I18n.t("generator.selectSail"));
		}

		_matrix	= [];

		var bInterpolate = $("#opt_intrpol").is(":checked");
		if (!bInterpolate) {
			//Retrieves speeds for sails selected
			var speedsSelected = [];
			for (var nSail in _polars.sail) {
				var sail = _polars.sail[nSail];
				if (!sailsSelected.includes(sail.name)) continue;
				speedsSelected.push( {sail:sail.name, speeds:_polars.sail[nSail].speed} );
			}

			//Aggregates best speeds
			_twa = _polars.twa.slice(0);
			_tws = _polars.tws.slice(0);

			var sailSpeeds = speedsSelected[0];
			for (var row in sailSpeeds.speeds) {
				_matrix.push( sailSpeeds.speeds[row].map(function(val){ return {speed:val, sail:sailSpeeds.sail}; }) );
			}
			for (var nSail in speedsSelected) {
				//Skip 1st row as already inserted in aggregated array
				if (nSail == 0) continue;

				for (var nTWA in _matrix) {
					for (var nTWS in _matrix[nTWA]) {
						if (speedsSelected[nSail].speeds[nTWA][nTWS] > _matrix[nTWA][nTWS].speed) {
							_matrix[nTWA][nTWS] = {
								speed	: speedsSelected[nSail].speeds[nTWA][nTWS],
								sail	: speedsSelected[nSail].sail
							};
						}
					}
				}
			}
		}
		else {
			//Directly rebuilds the best sail consolidated speeds array, including options applied
			var optionsSelected = $("#options_list input[type=checkbox]:checked")
				.map(function(){ return this.id;})
				.get();

			//if (!sailsSelected.includes(sail.name)) continue;


			var maxTWA	= _polars.twa.reduce(function(v1, v2){return Math.max(v1, v2)});
			var maxTWS	= _polars.tws.reduce(function(v1, v2){return Math.max(v1, v2)});
			var row		= [];
			_twa		= [];
			_tws		= [];

			//Builds custom scale
			for (var twa = 0; twa <= maxTWA; twa++) {
				_twa.push(twa);
			}
			for (var tws = 0; tws <= maxTWS; tws++) {
				_tws.push(tws);
			}

			for (var twa in _twa) {
				for (var tws in _tws) {
					var spds = PolarsReader.getSpeeds(twa, tws, _polars.label, optionsSelected).all;
					var spd = $.map(spds, function(val, idx){
							return {sail:idx, speed:val};
						})
						.filter(function(obj){
							return sailsSelected.includes(obj.sail);
						})
						.sort(function(obj1, obj2){
							if (obj1.speed < obj2.speed) return +1;
							if (obj1.speed > obj2.speed) return -1;
							return 0;
						})[0];

					row.push(spd);
				}
				_matrix.push(row);
				row = [];
			}
		}
	}
	function applyOptions() {
		//If Interpolation is active, Options and GlobalFactor are already included
		if ($("#opt_intrpol").is(":checked")) return;

		//Detects options selection
		var optionsSelected = $("#options_list input[type=checkbox]:checked")
			.map(function(){ return this.id;})
			.get();
		if (optionsSelected.length === 0) {
			return;
		}

		var globalFactor = (_polars.globalSpeedRatio === undefined) ? 1 : _polars.globalSpeedRatio;

    // 25/11/2025 (d/p Flying Phil) En plus de vérifier si pas d'options (foils et polish) prendre en compte que si le globalSpeedRatio est différent de 1 il faut l'appliquer
    if ((optionsSelected.length === 0) && (globalFactor === 1)) {
      return;
    }

		for (var nTWA in _matrix) {
			for (var nTWS in _matrix[nTWA]) {
				var twa = _twa[nTWA];
				var tws = _tws[nTWS];

				var foilFactor = (_polars.foil === undefined) ? 1 : PolarsReader.foilingFactor(optionsSelected, tws, twa, _polars.foil);
				var hullFactor = (_polars.hull === undefined) ? 1 : PolarsReader.hullingFactor(optionsSelected, _polars.hull);

				_matrix[nTWA][nTWS].speed *= foilFactor * hullFactor * globalFactor;
			}
		}
	}
	function printContent() {
		//Raw Text output
		if ($("#opt_xml").is(":checked")) {
			//XML
			printRawXML();
		}
		else {
			//CSV / SSV / TSV
			printRawCSV();
		}

		//Table output
		printArrayCSV();
	}
	function printRawCSV() {
		//Building printed array
		var arrCSV = [["TWA\\TWS"]];
		for (var nTWS in _tws) {
			arrCSV[0].push(_tws[nTWS]);
		}
		var row = [];
		for (var nTWA in _twa) {
			row.push(_twa[nTWA]);

			for (var nTWS in _matrix[nTWA]) {
				row.push(_matrix[nTWA][nTWS].speed.fix(_nbFixDigits, true));
			}

			arrCSV.push(row);
			row = [];
		}

		//Building output
		var sOut = "";
		var sepChar =
			$("#process_controls input[name=out_format]:checked").data("sepchar");
		for (var nRow in arrCSV) {
			sOut += arrCSV[nRow].join(sepChar) + '\n';
		}
		setCSVMessage(sOut);
	}
	function printRawXML() {
		//Building output
		var sOut = "";
		sOut += '<?xml version="1.0" encoding="ISO-8859-1" standalone="yes"?>\n';
		sOut += '<Polar xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n';

		for (var nTWS in _tws) {
			var tws = _tws[nTWS];
			if (tws === 0) continue;
			sOut += '	<PolarCurve>\n';
			sOut += '		<PolarCurveIndex value ="' + tws + '"/>\n';

			for (var nTWA in _twa) {
				var twa = _twa[nTWA];
				if (twa === 0) continue;
				sOut += '		<PolarItem><Angle value="' + twa + '"/><Value value="' + _matrix[nTWA][nTWS].speed.fix(_nbFixDigits, true) + '"/></PolarItem>\n';
			}

			sOut += '	</PolarCurve>\n';
		}
		sOut += '</Polar>\n';
		setCSVMessage(sOut);
	}
	function printArrayCSV() {
		sOut = "";
		var arrTWS = ["TWA\\TWS"];
		for (var nTWS in _tws) {
			arrTWS.push(_tws[nTWS]);
		}
		sOut += ""
			+ "<tr>"
			+ arrTWS.map(function(v){
					var sTWS = v;
					return "<td title='" + escapeHtml(v) + "'>" + escapeHtml(v) + "</td>";
				}).join("")
			+ "</tr>";

		for (var nTWA in _twa) {
			var sTWA = _twa[nTWA];
			sOut += ""
				+ "<tr><td title='" + escapeHtml(sTWA) + "'>" + escapeHtml(sTWA) + "</td>"
				+ _matrix[nTWA].map(function(v){
						var vSpd = v.speed.fix(_nbFixDigits, true);
						var sail = PolarsReader.sailLabel(v.sail);
						return "<td class='" + v.sail + "'"
								+ " title='" + vSpd + " (" + sail + ")'>"
								+ vSpd + "</td>";
					}).join("")
				+ "</tr>";
		}

		$("#csv_array")
			.empty()
			.append(sOut);
		$("#csv_array :first-child").addClass("b");
	}
	function registerEventHandlers() {
		//'Read Input' Button click
		$("#read_data").click(function() {
			readInput();
		});

		//'Toggle Input Field' Button click
		$("#toggle_input").click(function() {
			if (_bShowInput)
				hideInputField();
			else
				showInputField();
		});

		//'Process' Button click
		$("#process_data").click(function() {
			processInput();
		});

		$("#opt_array").click(function(){
			_bShowAsArray = !_bShowAsArray;
			$("#csv_output, #csv_array").toggle();
		});

		$("#opt_copycsv").click(function(){
			$("#csv_array").hide();
			$("#csv_output").show().prop("disabled", false).select();
			document.execCommand("copy");
			var elm = document.getElementById("csv_output");
			elm.setSelectionRange(0, 0);
			$("#csv_output").prop("disabled", true);

			if (_bShowAsArray) {
				$("#csv_output").hide();
				$("#csv_array").show();
			}

			setInfoMessage(I18n.t("generator.copied"));
		});

		$("#boats_select").click(function(e){
			e.stopPropagation();
			showPolarsListField();
		});
	}


	////////////////////////////////////////
	return {
		initialize	: initialize,
		getVersion	: getVersion
	};

})();
