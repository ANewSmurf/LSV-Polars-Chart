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
