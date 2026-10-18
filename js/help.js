
//= Screenshots matching the theme ==//
// Night screenshots live in img/dark/, day screenshots in img/.
function themedSrc(src) {
	var daySrc = src.replace("img/dark/", "img/");
	return (document.documentElement.getAttribute("data-theme") === "dark")
		? daySrc.replace("img/", "img/dark/")
		: daySrc;
}
function applyThemedImages() {
	$("img.themed").each(function(idx, elm){
		var src = $(elm).data("defsrc") || $(elm).attr("src");
		if (src) $(elm).attr("src", themedSrc(src));
	});
}
window.addEventListener("lsv-themechange", applyThemedImages);

//= On DOM Ready ==================//
$(function() {
	//Images Maps
	$("map area")
		.mouseover(function(evt){
			var img = $(evt.target).parent().prev();
			img.attr("src", img.is(".themed") ? themedSrc($(evt.target).data("imgsrc")) : $(evt.target).data("imgsrc"));
		})
		.mouseleave(function(evt){
			var img = $(evt.target).parent().prev();
			img.attr("src", img.is(".themed") ? themedSrc(img.data("defsrc")) : img.data("defsrc"));
		});

	$("map").prev().map(function(idx, elm){
		$(elm).attr("src", $(elm).data("defsrc"));
	});
	applyThemedImages();


	//Builds Table of Content
	$("#toc").empty().append(
		"<span class='title'>Page Content</span>" +
		"<span><a href='#_top'>&uparrow; Top</a></span><br/>"
	);
	$(".contentframe h5").map(function(idx, elm){
		var title	= $(elm).text();
		var anchor	= $(elm).parent().attr("id");
		$("#toc").append("<span><a href='#" + anchor + "'>" + title + "</a></span>");
	});


	//Animated Scrolls
	$("a[href^='#']").click(function(e) {
		e.preventDefault();
		var position = $($(this).attr("href")).offset().top;
		$("body, html").animate({ scrollTop : position }, 300);
	});
});
//=================================//
