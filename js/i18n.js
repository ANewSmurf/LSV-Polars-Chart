/*
 * Interface languages for LSV TOXCct.
 *
 * Load this file without "defer" in the <head>, before the other scripts. It:
 *  - picks the language: "lang" URL parameter, then the visitor's choice,
 *    then the browser language, then English;
 *  - loads locales/en.json and the chosen language's file;
 *  - translates every element marked with data-i18n, data-i18n-html or
 *    data-i18n-attr, then runs the I18n.ready() callbacks: the applications
 *    start there, so they build their texts with I18n.t() in the right language.
 *
 * Help pages declare <html data-i18n-page="help/chart_chart">: their long
 * texts are translated by locales/help/chart_chart.<lang>.json, which maps
 * each English paragraph to its translation (see translatePage below).
 */
(function () {
	"use strict";

	var VERSION = "1.0.0";
	var LANGUAGES = { en: "English", fr: "Français" };
	// English dates keep the browser's own format (undefined locale).
	var LOCALES = { en: undefined, fr: "fr-FR" };
	var DEFAULT = "en";
	var storageKey = "lsv-language";
	var sessionKey = "lsv-language-url";
	var root = document.documentElement;

	// Path from the page to the site root, taken from this script's own address ("" or "../").
	var script = document.currentScript;
	var scriptSrc = script ? script.getAttribute("src") : "js/i18n.js";
	var rootPath = scriptSrc.replace(/js\/i18n\.js.*$/, "");

	function supported(lang) {
		lang = String(lang || "").toLowerCase().slice(0, 2);
		return Object.prototype.hasOwnProperty.call(LANGUAGES, lang) ? lang : null;
	}

	function read(storage, key) {
		try { return window[storage].getItem(key); } catch (error) { return null; }
	}

	function write(storage, key, value) {
		try {
			if (value === null) window[storage].removeItem(key);
			else window[storage].setItem(key, value);
		} catch (error) {
			// The language still applies to the current page.
		}
	}

	function urlLanguage() {
		var match = /[?&]lang=([^&#]*)/i.exec(window.location.search);
		return match ? supported(decodeURIComponent(match[1])) : null;
	}

	function browserLanguage() {
		var list = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
		for (var i = 0; i < list.length; i++) {
			var lang = supported(list[i]);
			if (lang) return lang;
		}
		return null;
	}

	// A "lang" URL parameter applies to the pages visited next in this tab,
	// without changing the language chosen with the FR/EN button.
	var fromUrl = urlLanguage();
	if (fromUrl) write("sessionStorage", sessionKey, fromUrl);
	var lang = fromUrl
		|| supported(read("sessionStorage", sessionKey))
		|| supported(read("localStorage", storageKey))
		|| browserLanguage()
		|| DEFAULT;

	root.setAttribute("lang", lang);

	// The English text is already in the HTML. In another language, the page stays
	// hidden until it is translated, so the English text does not flash.
	if (lang !== DEFAULT) {
		var style = document.createElement("style");
		style.textContent = "html.i18n-pending body{visibility:hidden}";
		document.head.appendChild(style);
		root.classList.add("i18n-pending");
		window.setTimeout(reveal, 3000);
	}

	function reveal() {
		root.classList.remove("i18n-pending");
	}

	var dictionaries = { en: {} };
	dictionaries[lang] = dictionaries[lang] || {};
	var pageTexts = {};

	function load(path) {
		if (!window.fetch) return Promise.resolve({});
		return fetch(rootPath + path + "?v=" + VERSION)
			.then(function (response) { return response.ok ? response.json() : {}; })
			.catch(function (error) {
				console.warn("Cannot load translations '" + path + "': " + error);
				return {};
			});
	}

	var page = root.getAttribute("data-i18n-page");
	var loading = Promise.all([
		load("locales/en.json"),
		lang !== DEFAULT ? load("locales/" + lang + ".json") : Promise.resolve({}),
		page && lang !== DEFAULT ? load("locales/" + page + "." + lang + ".json") : Promise.resolve({})
	]).then(function (results) {
		dictionaries.en = results[0];
		if (lang !== DEFAULT) dictionaries[lang] = results[1];
		pageTexts = results[2] || {};
	});

	function lookup(dictionary, key) {
		var value = dictionary;
		var parts = key.split(".");
		for (var i = 0; i < parts.length; i++) {
			if (value === null || typeof value !== "object") return undefined;
			value = value[parts[i]];
		}
		return value;
	}

	function plural(value, count) {
		if (value === null || typeof value !== "object") return value;
		var form;
		if (Number(count) === 0 && value.zero !== undefined) form = "zero";
		else if (lang === "fr") form = Math.abs(count) < 2 ? "one" : "other";
		else form = Math.abs(count) === 1 ? "one" : "other";
		return value[form] !== undefined ? value[form] : value.other;
	}

	/**
	 * Text of a key in the current language, then in English, then the key itself.
	 * "{name}" is replaced by params.name. When params.count is given, an entry
	 * written as { "one": "...", "other": "..." } picks its plural form.
	 */
	function t(key, params) {
		params = params || {};
		var value = lookup(dictionaries[lang], key);
		if (value === undefined) value = lookup(dictionaries.en, key);
		if (value === undefined) return key;
		value = plural(value, params.count);
		if (typeof value !== "string") return key;
		return value.replace(/\{(\w+)\}/g, function (match, name) {
			return params[name] !== undefined ? params[name] : match;
		});
	}

	function has(key) {
		return typeof lookup(dictionaries[lang], key) !== "undefined" || typeof lookup(dictionaries.en, key) !== "undefined";
	}

	function each(scope, selector, callback) {
		var list = scope.querySelectorAll(selector);
		if (scope.matches && scope.matches(selector)) callback(scope);
		for (var i = 0; i < list.length; i++) callback(list[i]);
	}

	/**
	 * Translates the marked elements inside scope (the whole document by default):
	 *  - data-i18n="key": the text of the element;
	 *  - data-i18n-html="key": its HTML content;
	 *  - data-i18n-attr="title:key; aria-label:key2": its attributes.
	 * A key missing from the dictionaries leaves the English text in place.
	 */
	function apply(scope) {
		scope = scope || document;
		each(scope, "[data-i18n]", function (element) {
			var key = element.getAttribute("data-i18n");
			if (has(key)) element.textContent = t(key);
		});
		each(scope, "[data-i18n-html]", function (element) {
			var key = element.getAttribute("data-i18n-html");
			if (has(key)) element.innerHTML = t(key);
		});
		each(scope, "[data-i18n-attr]", function (element) {
			element.getAttribute("data-i18n-attr").split(";").forEach(function (pair) {
				var parts = pair.split(":");
				var attr = parts[0] && parts[0].trim();
				var key = parts[1] && parts[1].trim();
				if (!attr || !key || !has(key)) return;
				if (attr === "value" && "value" in element) element.value = t(key);
				else element.setAttribute(attr, t(key));
			});
		});
	}

	// Blocks of a help page translated by their own English text.
	var PAGE_BLOCKS = "h1, h2, h3, h4, h5, h6, p, li, dt, dd, th, td, figcaption, .sidebox > span";

	function normalize(html) {
		return html.replace(/\s+/g, " ").trim();
	}

	/**
	 * Translates a help page: each heading, paragraph or list item of <article>
	 * whose English HTML is a key of the page file is replaced by its value.
	 * A block changed in English is no longer found, and stays in English until
	 * its translation is updated (tools/check-i18n.js lists them).
	 */
	function translatePage() {
		if (!page || lang === DEFAULT) return;
		if (pageTexts["@title"]) document.title = pageTexts["@title"];
		var article = document.querySelector("article");
		if (!article) return;
		// Texts repeated on every help page are in the "pageTexts" section of locales/<lang>.json.
		var common = lookup(dictionaries[lang], "pageTexts") || {};
		var blocks = article.querySelectorAll(PAGE_BLOCKS);
		var missing = [];
		for (var i = 0; i < blocks.length; i++) {
			var key = normalize(blocks[i].innerHTML);
			if (!key) continue;
			if (Object.prototype.hasOwnProperty.call(pageTexts, key)) blocks[i].innerHTML = pageTexts[key];
			else if (Object.prototype.hasOwnProperty.call(common, key)) blocks[i].innerHTML = common[key];
			else if (/[A-Za-z]{2}/.test(blocks[i].textContent) && !blocks[i].closest("#toc")) missing.push(blocks[i]);
		}
		// With "i18n=debug" in the URL, the blocks without translation are outlined in red
		// and listed in the console, ready to be copied into the page file.
		if (/[?&]i18n=debug/.test(window.location.search) && missing.length) {
			var list = {};
			missing.forEach(function (block) {
				block.style.outline = "2px dashed #d64545";
				list[normalize(block.innerHTML)] = "";
			});
			console.warn(missing.length + " block(s) without translation in locales/" + page + "." + lang + ".json:\n" + JSON.stringify(list, null, "\t"));
		}
	}

	var isReady = false;
	var callbacks = [];

	function ready(callback) {
		if (isReady) callback();
		else callbacks.push(callback);
	}

	function finish() {
		translatePage();
		apply(document);
		isReady = true;
		reveal();
		// "autofocus" is ignored while the page is hidden: it is applied once the page shows.
		var autofocus = document.querySelector("[autofocus]");
		if (autofocus && document.activeElement === document.body) autofocus.focus({ preventScroll: true });
		while (callbacks.length) {
			try { callbacks.shift()(); } catch (error) { console.error(error); }
		}
		if (typeof window.CustomEvent === "function") {
			window.dispatchEvent(new CustomEvent("lsv-languageready", { detail: { lang: lang } }));
		}
	}

	// The page is translated once it is parsed and the dictionaries are loaded.
	function onDomReady() {
		loading.then(finish, finish);
	}

	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", onDomReady);
	else onDomReady();

	/** Saves the visitor's choice and reloads the page in that language. */
	function setLanguage(next) {
		next = supported(next) || DEFAULT;
		write("localStorage", storageKey, next);
		write("sessionStorage", sessionKey, null);
		var url = window.location.href.replace(/([?&])lang=[^&#]*(&?)/i, function (match, before, after) {
			return after ? before : "";
		}).replace(/[?&](#|$)/, "$1");
		if (url === window.location.href) window.location.reload();
		else window.location.replace(url);
	}

	window.I18n = {
		normalize: normalize,
		pageBlocks: PAGE_BLOCKS,
		lang: lang,
		locale: LOCALES[lang],
		languages: LANGUAGES,
		rootPath: rootPath,
		t: t,
		has: has,
		apply: apply,
		ready: ready,
		setLanguage: setLanguage
	};
})();
