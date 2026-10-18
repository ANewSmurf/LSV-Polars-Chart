(function () {
	"use strict";

	var panel = document.getElementById("chart_panel");
	var fullscreenButton = document.getElementById("chart_fullscreen");

	if (!panel || !fullscreenButton) return;

	function isExpanded() {
		return document.fullscreenElement === panel || panel.classList.contains("is-expanded");
	}

	function updateFullscreenButton() {
		var expanded = isExpanded();
		fullscreenButton.setAttribute("aria-pressed", expanded ? "true" : "false");
		fullscreenButton.setAttribute(
			"aria-label",
			expanded ? "Exit chart fullscreen" : "Display the chart in fullscreen"
		);
		fullscreenButton.setAttribute(
			"title",
			expanded ? "Exit fullscreen" : "Display the chart in fullscreen"
		);
		fullscreenButton.innerHTML = expanded ? "&#x2715;" : "&#x26F6;";
	}

	function toggleFallbackFullscreen(forceClose) {
		var shouldExpand = forceClose ? false : !panel.classList.contains("is-expanded");
		panel.classList.toggle("is-expanded", shouldExpand);
		document.body.classList.toggle("chart-is-expanded", shouldExpand);
		updateFullscreenButton();
	}

	fullscreenButton.addEventListener("click", function () {
		if (document.fullscreenEnabled && panel.requestFullscreen) {
			if (document.fullscreenElement === panel) {
				document.exitFullscreen();
			} else {
				panel.requestFullscreen().catch(function () {
					toggleFallbackFullscreen(false);
				});
			}
			return;
		}

		toggleFallbackFullscreen(false);
	});

	document.addEventListener("fullscreenchange", updateFullscreenButton);
	document.addEventListener("keydown", function (event) {
		if (event.key === "Escape" && panel.classList.contains("is-expanded")) {
			toggleFallbackFullscreen(true);
		}
	});

	updateFullscreenButton();
})();

/* Desktop burger drawer holding the race list and the race information,
   and initial scroll to the chart when the page is opened with parameters. */
(function () {
	"use strict";

	var body = document.body;
	var identity = document.querySelector(".app-brand__identity");
	var brand = document.querySelector(".app-brand");
	// Captured now: the application rewrites the URL during its initialisation.
	var hasChartParams = /[?&](race_id|twa|tws)=/.test(window.location.search);

	if (!body.classList.contains("dashboard-page") || !identity || !brand) return;

	var burger = document.createElement("button");
	burger.type = "button";
	burger.className = "dashboard-burger";
	burger.setAttribute("aria-controls", "race_selection");

	var summary = document.createElement("button");
	summary.type = "button";
	summary.className = "dashboard-current";
	summary.title = "Change race";

	var scrim = document.createElement("div");
	scrim.className = "dashboard-scrim";

	identity.insertBefore(burger, identity.firstChild);
	identity.appendChild(summary);
	body.appendChild(scrim);

	function isOpen() {
		return body.classList.contains("drawer-open");
	}

	function measureBar() {
		var bottom = brand.getBoundingClientRect().bottom;
		document.documentElement.style.setProperty("--dashboard-bar", Math.round(bottom + 8) + "px");
	}

	function updateBurger() {
		var open = isOpen();
		burger.setAttribute("aria-expanded", open ? "true" : "false");
		burger.setAttribute("aria-label", open ? "Hide races and race information" : "Show races and race information");
		burger.title = open ? "Hide races" : "Show races";
		burger.innerHTML = open ? "&#x2715;" : "&#9776;";
	}

	function setDrawer(open) {
		if (open) measureBar();
		body.classList.toggle("drawer-open", open);
		updateBurger();
	}

	function updateSummary() {
		var race = document.getElementById("data_race_name");
		var boat = document.getElementById("data_boat_name");
		var raceName = document.createElement("b");
		var boatName = document.createElement("span");
		raceName.textContent = race ? race.textContent : "-";
		boatName.textContent = boat ? boat.textContent : "";
		summary.textContent = "";
		summary.appendChild(raceName);
		summary.appendChild(boatName);
	}

	burger.addEventListener("click", function () { setDrawer(!isOpen()); });
	summary.addEventListener("click", function () { setDrawer(true); });
	scrim.addEventListener("click", function () { setDrawer(false); });
	window.addEventListener("resize", function () { if (isOpen()) measureBar(); });
	document.addEventListener("keydown", function (event) {
		if (event.key === "Escape" && isOpen()) setDrawer(false);
	});
	// Close the drawer once a race has been picked
	document.addEventListener("click", function (event) {
		var target = event.target;
		if (isOpen() && target.closest && target.closest("#race_selection .race .imgbtn")) {
			window.setTimeout(function () { setDrawer(false); }, 150);
		}
	});

	["data_race_name", "data_boat_name"].forEach(function (id) {
		var element = document.getElementById(id);
		if (element && window.MutationObserver) {
			new MutationObserver(updateSummary).observe(element, { childList: true, characterData: true, subtree: true });
		}
	});

	updateBurger();
	updateSummary();

	// On smaller screens the page still scrolls: bring the chart into view.
	if (hasChartParams) {
		window.addEventListener("load", function () {
			window.requestAnimationFrame(function () {
				var panel = document.getElementById("chart_panel");
				if (!panel) return;
				var top = panel.getBoundingClientRect().top + window.pageYOffset - 10;
				window.scrollTo({ top: Math.max(0, top), behavior: "instant" });
			});
		});
	}
})();
