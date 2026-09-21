<?php
    require_once '../../includes/php_global_start.inc.php';
	require_once '../../includes/dto/user.dto.php';
	require_once '../../includes/libs/send_emails.lib.php';

	$RedirectUrl = '/polars/';
	$reason = $from = $username = $subject = $msg = '';
	$error = null;
	$classes = [];
	$setFocus = 'fld_emailaddr';

	try {
		require '../../includes/php_global_try.inc.php';
		CLog::debug("Contact Email à propos des Polaires");
		$_SESSION['Action'] = "Contact Email à propos des Polaires";

		$redirectCandidate = (string) ($_POST['RedirectUrl'] ?? $_GET['RedirectUrl'] ?? $_SERVER['HTTP_REFERER'] ?? '');
		$RedirectUrl = lsv_safe_redirect_url(
			$redirectCandidate,
			Config::getAppValue(Config::APP_DOMAINNAME),
			'/polars/'
		);

		$allowedReasons = ['Report Bug', 'Report Data Issue', 'Request Feature', 'Other'];
		$to = Config::getEmailValue(Config::EMAIL_WEBMASTERMAIL);

		if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'submit') {
			$reason = trim((string) ($_POST['reason'] ?? ''));
			$from = trim((string) ($_POST['emailaddr'] ?? ''));
			$username = trim((string) ($_POST['username'] ?? ''));
			$subject = trim((string) ($_POST['subject'] ?? ''));
			$msg = trim((string) ($_POST['msg'] ?? ''));
			if (!in_array($reason, $allowedReasons, true)) $reason = '';

			if (!lsv_verify_csrf_token((string) ($_POST['csrf_token'] ?? ''))) {
				$error = 'The form session has expired. Please reload the page.';
			} elseif (!filter_var($from, FILTER_VALIDATE_EMAIL) || strlen($from) > 254) {
				$error = 'Email address is invalid';
				$classes['fld_emailaddr'] = 'red_out';
			} elseif ($username === '' || strlen($username) > 120) {
				$error = 'Username is mandatory and must not exceed 120 characters';
				$setFocus = 'fld_nickname';
				$classes['fld_nickname'] = 'red_out';
			} elseif ($subject === '' || strlen($subject) > 200) {
				$error = 'Subject is mandatory and must not exceed 200 characters';
				$setFocus = 'fld_subject';
				$classes['fld_subject'] = 'red_out';
			} elseif ($msg === '' || strlen($msg) > 20000) {
				$error = 'Message body is mandatory and must not exceed 20000 characters';
				$setFocus = 'fld_body';
				$classes['fld_body'] = 'red_out';
			} elseif (time() - (int) ($_SESSION['polars_contact_last_sent_at'] ?? 0) < 30) {
				$error = 'Please wait 30 seconds before sending another message.';
			}

			if ($error === null) {
				$newSubject = '[Polars] ' . ($reason !== '' ? "[$reason] " : '') . $subject;
				DefinedEmailsCatalog::envoiEmailPolarsDirect($from, $to, $username, $newSubject, $msg)->send();
				$_SESSION['polars_contact_last_sent_at'] = time();
				unset($_SESSION['polars_csrf_token']);
				header('Location: ' . $RedirectUrl, true, 303);
				exit();
			}

			CLog::warn("Error while attempting to send an Email: $error");
		}

	} catch (Throwable $e) {
		require '../../includes/php_global_catch.inc.php';
	}

	$_SESSION['t_redir'] = $RedirectUrl;

?><!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
	<title>LSV TOXCct · Contact</title>
	<meta http-equiv="content-type" content="text/html; charset=utf-8">
	<meta name="description"	lang="en" content="Toxcct's Polars Contact Form">
	<meta name="abstract"		lang="en" content="Toxcct's Polars Chart for Virtual Regatta Offshore">
	<meta name="title"			lang="en" content="Toxcct's Polars Chart for Virtual Regatta Offshore Races">
	<meta name="author"			lang="en" content="toxcct">
	<meta name="keywords"		content="toxcct, Polars, Chart, Virtual, Regatta, Offshore, Boat, Race, Races, Zezo">
	<meta name="robots"			content="all">
	<meta name="rating"			content="General">
	<meta name="category"		content="Sport">
	<meta name="publisher"		content="Toxcct">
	<meta name="copyright"		content="Toxcct 2018">
 	<meta name="viewport"		content="width=device-width, initial-scale=1">
 	<link rel="icon"			type="image/png" href="favicon-help.png" />
	<link rel="stylesheet"		type="text/css"	 href="css/general.css?v=12" />
	<link rel="stylesheet"		type="text/css"	 href="css/contact.css?v=3" />
	<link rel="stylesheet"		type="text/css"	 href="css/modern.css?v=1.0.0" media="screen" />
	<script type="text/javascript" src="js/lib/jquery-3.2.1.min.js"></script>
	<script type="text/javascript" src="js/contact.js?v=11"></script>
	<script type="text/javascript" src="js/lib/gtag.js?v=2"></script>
</head>

<body class="contact-page">
	<header id="_top"><div class="app-brand"><a class="app-brand__identity" href="index.htm"><img class="app-brand__logo" src="favicon-help.png" alt="LSV TOXCct"><div><span class="app-brand__name">Contact</span><span class="app-brand__tagline">LSV TOXCct applications</span></div></a><nav class="app-nav" aria-label="Main navigation"><a href="index.htm">Polars</a><a href="generator.htm">Generator</a><a class="is-current" href="help/index.htm">Help</a></nav></div></header>
	<article class="grid2cols">
		<div class="column1">
			<div class="sticky">
				<div class="sidebox grid1cols">
					<span><a href="./help/">&loarr; Help Section</a></span>
				</div>
				<div class="sidebox grid1cols">
					<span><a href="./">&loarr; Polars Chart Application</a></span>
				</div>
				<div class="sidebox grid1cols">
					<span><a href="./generator.htm">&loarr; CSV Generator Application</a></span>
				</div>
			</div>
		</div>

		<div class="column2">
			<div class="contentframe">
				<h1>Contact Me</h1>
			</div>

			<div class="contentframe">
				<form method="POST" id="contactForm" action="contact.php">
					<input type="hidden" name="action" value="submit" />
					<input type="hidden" name="csrf_token" value="<?=lsv_escape(lsv_csrf_token()) ?>" />
					<input type="hidden" name="RedirectUrl" value="<?=lsv_escape($RedirectUrl) ?>" />
					<input type="hidden" name="reason" value="<?=lsv_escape($reason) ?>" />

					<label for="fld_reason">Reason<span class=""></span></label>
					<select id="fld_reason">
						<option></option>
						<option<?=$reason === 'Report Bug'			? ' selected' : '' ?>>Report Bug</option>
						<option<?=$reason === 'Report Data Issue'	? ' selected' : '' ?>>Report Data Issue</option>
						<option<?=$reason === 'Request Feature'		? ' selected' : '' ?>>Request Feature</option>
						<option<?=$reason === 'Other'				? ' selected' : '' ?>>Other</option>
					</select>

					<label for="fld_emailaddr">Email Address<span class="mandatory"></span></label>
					<input type="text" name="emailaddr" id="fld_emailaddr"
						<?=isset($classes['fld_emailaddr']) ? ' class="' . lsv_escape($classes['fld_emailaddr']) . '"' : '' ?> value="<?=lsv_escape($from) ?>" autocomplete="email" <?=$setFocus === 'fld_emailaddr' ? 'autofocus' : '' ?> />

					<label for="fld_nickname">Nickname<span class="mandatory"></span></label>
					<input type="text" name="username" id="fld_nickname"
						<?=isset($classes['fld_nickname']) ? ' class="' . lsv_escape($classes['fld_nickname']) . '"' : '' ?> value="<?=lsv_escape($username) ?>" autocomplete="username" <?=$setFocus === 'fld_nickname' ? 'autofocus' : '' ?> />

					<label for="fld_subject">Subject<span class="mandatory"></span></label>
					<input type="text" name="subject"  id="fld_subject"
						<?=isset($classes['fld_subject']) ? ' class="' . lsv_escape($classes['fld_subject']) . '"' : '' ?> value="<?=lsv_escape($subject) ?>" <?=$setFocus === 'fld_subject' ? 'autofocus' : '' ?> />

					<label for="fld_body">Message<span class="mandatory"></span></label>
					<textarea name="msg" id="fld_body"
						<?=isset($classes['fld_body']) ? ' class="' . lsv_escape($classes['fld_body']) . '"' : '' ?> <?=$setFocus === 'fld_body' ? 'autofocus' : '' ?>><?=lsv_escape($msg) ?></textarea>

					<span class="space<?=$error !== null ? ' error' : '' ?>"><?=$error !== null ? lsv_escape($error) : '' ?></span>

					<input type="submit" class="bigBlueButton" value="Send Email" id="btn_sendmail" disabled />
				</form>
			</div>
		</div>
	</article>
</body>
</html>
