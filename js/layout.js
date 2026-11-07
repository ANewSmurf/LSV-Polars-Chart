/*
 * Header shared by every page.
 *
 * Each page only holds <div class="app-brand" data-page="..."></div>, followed
 * by <script src="js/layout.js"></script> so the header is in place before the
 * other scripts run. The texts carry data-i18n keys: js/i18n.js translates them.
 */
(function () {
	"use strict";

	var brand = document.querySelector(".app-brand[data-page]");
	if (!brand) return;

	var root = window.I18n ? I18n.rootPath : "";
	var lang = window.I18n ? I18n.lang : "en";

	var pages = {
		polars: { logo: "favicon.png", name: "brand.polars.name", tagline: "brand.polars.tagline", badge: "brand.polars.badge", nav: "polars", link: false },
		generator: { logo: "favicon-gen.png", name: "brand.generator.name", tagline: "brand.generator.tagline", badge: "brand.generator.badge", nav: "generator" },
		releases: { logo: "favicon-help.png", name: "brand.releases.name", tagline: "brand.apps", badge: "brand.releases.badge" },
		contact: { logo: "favicon-help.png", name: "brand.contact.name", tagline: "brand.apps", badge: "brand.contact.badge", nav: "contact" },
		help: { logo: "favicon-help.png", name: "brand.help.name", tagline: "brand.help.tagline", badge: "brand.help.badge", nav: "help" }
	};

	// English texts, shown until the dictionaries are loaded or if they cannot be.
	var english = {
		"brand.polars.name": "LSV Polars Chart",
		"brand.polars.tagline": "Virtual Regatta polar performance",
		"brand.polars.badge": "Polars chart",
		"brand.generator.name": "Polar Generator",
		"brand.generator.tagline": "Create routing-ready polar files",
		"brand.generator.badge": "Polars Generator",
		"brand.releases.name": "Release Notes",
		"brand.releases.badge": "Release Notes",
		"brand.contact.name": "Contact",
		"brand.contact.badge": "Contact Me",
		"brand.help.name": "Help Center",
		"brand.help.tagline": "LSV TOXCct documentation",
		"brand.help.badge": "Polars Help Center",
		"brand.apps": "LSV TOXCct applications",
		"nav.label": "Main navigation",
		"nav.polars": "Polars",
		"nav.generator": "Generator",
		"nav.help": "Help",
		"nav.contact": "Contact Me"
	};

	var navigation = [
		{ id: "polars", href: "index.htm" },
		{ id: "generator", href: "generator.htm" },
		{ id: "help", href: "help/index.htm" },
		{ id: "contact", href: "contact.php" }
	];

	var config = pages[brand.getAttribute("data-page")] || pages.polars;

	function element(tag, className, key) {
		var node = document.createElement(tag);
		if (className) node.className = className;
		if (key) {
			node.setAttribute("data-i18n", key);
			node.textContent = english[key] || key;
		}
		return node;
	}

	var identity = element(config.link === false ? "div" : "a", "app-brand__identity");
	if (config.link !== false) identity.href = root + "index.htm";
	var logo = element("img", "app-brand__logo");
	logo.src = root + config.logo;
	logo.alt = "LSV TOXCct";
	var titles = element("div");
	titles.appendChild(element("span", "app-brand__name", config.name));
	titles.appendChild(element("span", "app-brand__tagline", config.tagline));
	identity.appendChild(logo);
	identity.appendChild(titles);

	var actions = element("div", "app-brand__actions");
	var nav = element("nav", "app-nav");
	nav.setAttribute("aria-label", english["nav.label"]);
	nav.setAttribute("data-i18n-attr", "aria-label:nav.label");
	navigation.forEach(function (item) {
		var link = element("a", item.id === config.nav ? "is-current" : "", "nav." + item.id);
		link.href = root + item.href;
		if (item.id === config.nav) link.setAttribute("aria-current", "page");
		nav.appendChild(link);
	});
	actions.appendChild(nav);

	// FR/EN button: it names the other language, and switches to it.
	var other = lang === "fr" ? "en" : "fr";
	var languageButton = element("button", "language-toggle");
	languageButton.type = "button";
	languageButton.id = "language_toggle";
	languageButton.textContent = other.toUpperCase();
	languageButton.lang = other;
	languageButton.title = other === "fr" ? "Afficher en français" : "Switch to English";
	languageButton.setAttribute("aria-label", languageButton.title);
	languageButton.addEventListener("click", function () {
		if (window.I18n) I18n.setLanguage(other);
	});
	actions.appendChild(languageButton);

	actions.appendChild(element("span", "app-brand__badge", config.badge));

	brand.replaceChildren(identity, actions);
})();
