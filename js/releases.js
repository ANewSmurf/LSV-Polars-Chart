
function escapeToc(text) {
	return $("<span>").text(text).html();
}

//= On DOM Ready ==================//
// Starts once the page is translated (js/i18n.js), so the texts built here use I18n.t().
I18n.ready(function() {
	//Builds Table of Content
	$("#toc").empty().append(
		"<span class='title'>" + escapeToc(I18n.t("toc.title")) + "</span>" +
		"<span><a href='#_top'>&uparrow; " + escapeToc(I18n.t("toc.top")) + "</a></span>"
	);

	$(".contentframe h3").map(function(idx, elm){
		var title	= $(elm).text();
		var anchor	= $(elm).parent().attr("id");
		$("#toc").append("<br/><span><a href='#" + anchor + "'>" + title + "</a></span>");

		$(elm).parent().find("h5").map(function(idx, elm){
			var version = $(elm).text();
			var id = ($(elm).parent().attr("id") + "_" + version + "_" + $(elm).index()).replace(/\./g, "_");
			$(elm).attr("id", id);
			$("#toc").append("<span><a href='#" + id + "'>" + version + "</a></span>");

			console.log( id );
		});
	});

	//Animated Scrolls
	$("a[href^='#']").click(function(e) {
		e.preventDefault();
		var position = $($(this).attr("href")).offset().top;
		$("body, html").animate({ scrollTop : position }, 300);
	});
});
//=================================//
