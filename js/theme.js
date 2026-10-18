(function () {
	"use strict";

	var storageKey = "lsv-color-theme";
	var root = document.documentElement;
	var media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
	var toggleButton = null;

	function storedTheme() {
		try {
			var value = window.localStorage.getItem(storageKey);
			return value === "dark" || value === "light" ? value : null;
		} catch (error) {
			return null;
		}
	}

	function systemTheme() {
		return media && media.matches ? "dark" : "light";
	}

	function updateThemeColor(theme) {
		var themeColor = document.querySelector('meta[name="theme-color"]');
		if (!themeColor) {
			themeColor = document.createElement("meta");
			themeColor.setAttribute("name", "theme-color");
			document.head.appendChild(themeColor);
		}
		themeColor.setAttribute("content", theme === "dark" ? "#07131d" : "#071a2b");
	}

	function updateToggle(theme) {
		if (!toggleButton) return;
		var isDark = theme === "dark";
		var label = isDark ? "Switch to light mode" : "Switch to night mode";
		toggleButton.textContent = isDark ? "☀" : "☾";
		toggleButton.setAttribute("aria-label", label);
		toggleButton.setAttribute("aria-pressed", isDark ? "true" : "false");
		toggleButton.setAttribute("title", label);
	}

	function applyTheme(theme, persist) {
		root.setAttribute("data-theme", theme);
		root.style.colorScheme = theme;
		if (persist) {
			try {
				window.localStorage.setItem(storageKey, theme);
			} catch (error) {
				// The selected theme still applies for the current page.
			}
		}
		updateThemeColor(theme);
		updateToggle(theme);
		if (typeof window.CustomEvent === "function") {
			window.dispatchEvent(new CustomEvent("lsv-themechange", { detail: { theme: theme } }));
		}
	}

	function createToggle() {
		var actions = document.querySelector(".app-brand__actions");
		if (!actions || document.getElementById("theme_toggle")) return;

		toggleButton = document.createElement("button");
		toggleButton.id = "theme_toggle";
		toggleButton.className = "theme-toggle";
		toggleButton.type = "button";
		toggleButton.addEventListener("click", function () {
			applyTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark", true);
		});

		var badge = actions.querySelector(".app-brand__badge");
		actions.insertBefore(toggleButton, badge || null);
		updateToggle(root.getAttribute("data-theme") || systemTheme());
	}

	applyTheme(storedTheme() || systemTheme(), false);

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", createToggle);
	} else {
		createToggle();
	}

	window.addEventListener("storage", function (event) {
		if (event.key === storageKey) applyTheme(storedTheme() || systemTheme(), false);
	});

	if (media) {
		var systemThemeChanged = function (event) {
			if (!storedTheme()) applyTheme(event.matches ? "dark" : "light", false);
		};
		if (typeof media.addEventListener === "function") media.addEventListener("change", systemThemeChanged);
		else if (typeof media.addListener === "function") media.addListener(systemThemeChanged);
	}
})();
