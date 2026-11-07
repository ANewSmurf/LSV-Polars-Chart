#!/usr/bin/env node
/*
 * Checks the interface translations: run "node tools/check-i18n.js" from the site root.
 *
 *  - every key of locales/en.json has a translation in each other locales/<lang>.json;
 *  - no translation is left without its English key;
 *  - every key used by the pages (data-i18n, data-i18n-html, data-i18n-attr) and by
 *    the scripts (I18n.t("...")) exists in locales/en.json.
 *
 * Help pages are translated block by block: open a help page with "?lang=fr&i18n=debug"
 * to outline its untranslated blocks and list them in the browser console.
 */
"use strict";

var fs = require("fs");
var path = require("path");

var root = path.resolve(__dirname, "..");
var errors = 0;

function read(file) {
	return fs.readFileSync(path.join(root, file), "utf8");
}

function flatten(object, prefix, out) {
	out = out || {};
	Object.keys(object).forEach(function (key) {
		var value = object[key];
		var name = prefix ? prefix + "." + key : key;
		// Plural forms ({ one, other }) count as one key.
		var isPlural = value && typeof value === "object" && "other" in value && Object.keys(value).every(function (form) {
			return ["zero", "one", "other"].indexOf(form) >= 0;
		});
		if (value && typeof value === "object" && !isPlural) flatten(value, name, out);
		else out[name] = value;
	});
	return out;
}

function report(message) {
	errors++;
	console.log("  " + message);
}

var en = flatten(JSON.parse(read("locales/en.json")));
var languages = fs.readdirSync(path.join(root, "locales")).filter(function (file) {
	return /^[a-z]{2}\.json$/.test(file) && file !== "en.json";
});

languages.forEach(function (file) {
	var other = JSON.parse(read("locales/" + file));
	// "pageTexts" holds help texts translated by their English HTML: not keys.
	delete other.pageTexts;
	other = flatten(other);
	console.log("locales/" + file);
	Object.keys(en).forEach(function (key) {
		if (!(key in other)) report("missing translation: " + key);
	});
	Object.keys(other).forEach(function (key) {
		if (!(key in en)) report("not in en.json: " + key);
	});
});

function walk(dir, extensions, out) {
	out = out || [];
	fs.readdirSync(path.join(root, dir)).forEach(function (name) {
		var file = path.join(dir, name);
		if (/^(\.|node_modules|lib$)/.test(name)) return;
		var stat = fs.statSync(path.join(root, file));
		if (stat.isDirectory()) walk(file, extensions, out);
		else if (extensions.indexOf(path.extname(name)) >= 0) out.push(file);
	});
	return out;
}

var used = {};
function use(key, file) {
	(used[key] = used[key] || []).push(file);
}

walk(".", [".htm", ".html", ".php"]).forEach(function (file) {
	var text = read(file);
	var match;
	var simple = /data-i18n(?:-html)?="([\w.]+)"/g;
	while ((match = simple.exec(text))) use(match[1], file);
	var attrs = /data-i18n-attr="([^"]+)"/g;
	while ((match = attrs.exec(text))) {
		match[1].split(";").forEach(function (pair) {
			var key = (pair.split(":")[1] || "").trim();
			if (key) use(key, file);
		});
	}
});

walk("js", [".js"]).forEach(function (file) {
	var text = read(file);
	var match;
	var calls = /(?:I18n\.(?:t|has)|lsvText)\("([\w.]+)"/g;
	while ((match = calls.exec(text))) if (!/\.$/.test(match[1])) use(match[1], file);
	// polars_views.js prefixes its own keys with "chart.".
	if (/polars_views\.js$/.test(file)) {
		var local = /\bt\("(\w+)"/g;
		while ((match = local.exec(text))) use("chart." + match[1], file);
	}
	if (/polars_echarts\.js$/.test(file)) {
		var full = /\bt\("([\w.]+)"/g;
		while ((match = full.exec(text))) use(match[1], file);
		var hints = /"(hints\.\w+)"/g;
		while ((match = hints.exec(text))) use(match[1], file);
	}
	if (/layout\.js$/.test(file)) {
		var layout = /"((?:brand|nav)\.[\w.]+)"/g;
		while ((match = layout.exec(text))) use(match[1], file);
	}
});

console.log("keys used by pages and scripts");
Object.keys(used).sort().forEach(function (key) {
	if (!(key in en)) report("not in en.json: " + key + " (" + used[key].filter(function (f, i, a) { return a.indexOf(f) === i; }).join(", ") + ")");
});

if (errors) {
	console.log("\n" + errors + " problem(s) found.");
	process.exit(1);
}
console.log("\nAll translations are consistent.");
