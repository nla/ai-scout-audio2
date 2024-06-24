  var unsavedChanges = false ;
	var wid = 0 ;	// each word span has a unique id based on this counter
	const idToCword =  new Array() ;
	const wordsByTS = new Array() ;
	
	var TRANSCRIPT_ID ; // ="nla.obj-212623729" ;
	var startSec ; // = Number("3") ;

	var audioEle = null ;
	var audioDebug = null ;
	
	var syncTranscript = true ;
	
	var howToDialog ;
	var speakerDialog ;
	
	var maxSpk = -1 ;
	var currentSpeakerEleForChange = null ;
	
	const speakerList = {} ; // {spk1: "Speaker Unknown"} ;
	
	function lookupSpeaker(spk) {
	
		return speakerList[spk] ;		
	}
	
	function showSnackBar(msg) {
	
		console.log("showSnackBar " + msg) ;
		var snackDiv = document.getElementById("snackbar") ;
		snackDiv.classList.add("snackShow") ;
		snackDiv.innerHTML = msg ;
		setTimeout(function(){ console.log("hide snackbar") ; document.getElementById("snackbar").classList.remove("snackShow") ; }, 4000) ;

		//alert("snackbar: " + msg) ;
		/* hinton
		var snackDiv = $("#snackbar") ;
		snackDiv.addClass("snackShow") ;
		snackDiv.html(msg) ;
		setTimeout(function(){ console.log("hide snackbar") ; snackDiv.removeClass("snackShow") ; }, 4000) ;
		*/
		// note - that 4sec timeout has to be synced with the elapsed time for fadeout in the animation css  
	}
	
	function setSaveTranscriptButton(enabled) {
	
	  console.log("sfButton enabled " + enabled + " unsavedChanges " + unsavedChanges) ;

		let sb = document.getElementById("sfButton") ;
		
		sb.disabled = !enabled ;
		if (enabled) sb.classList.remove('disable') ;
		else sb.classList.add('disable') ;

		unsavedChanges = enabled ;
	}
	
	
	function showHowTo() {

		document.getElementById("howTo").showModal() ;
		console.log(new Error("showHowTo called").stack) ;
	}



	
	function confirmExit() {
		if (unsavedChanges) {
			return "You have made changes to the features on this map but not saved them yet.  Do you wish to discard your changes?" ;
		}
	}



	let findStartingWord = 0 ;
	let foundIndex = -1 ;


	window.addEventListener("load", async (event) => {
		console.log("load event running") ;

		TRANSCRIPT_ID = document.getElementById("TRANSCRIPT_ID").value ;
		startSec = Number(document.getElementById("startSec").value) ;

		window.onbeforeunload = confirmExit ;

		setSaveTranscriptButton(false) ;

		document.getElementById("showHowTo").addEventListener("click", showHowTo) ;

		document.getElementById("closeHowTo").addEventListener("click", function() {
			document.getElementById("howTo").close() ;
		}) ;

		document.getElementById("closePopupSpk").addEventListener("click", function() {
			document.getElementById("popupSpk").close() ;
		}) ;

		

		

		document.getElementById("SyncTranscript").addEventListener("change", (event) => {

			if (event.target.checked) {
				syncTranscript = true ;			
				showSnackBar("The transcript will now automatically scroll to match the audio") ;
			}
			else {
				syncTranscript = false ;
				showSnackBar("Automatic scrolling of the transcript has been disabled") ;
			}				
		}) ;
		 
		document.getElementById("ts").addEventListener('keydown', keydown) ;
		document.getElementById("right").addEventListener('keydown', keydown) ;
		//document.getElementById("headerDiv").addEventListener('keydown', keydown) ;
		//document.getElementById("nlaBanner").on('keydown', keydown) ;
		document.getElementById("audioDiv").addEventListener('keydown', keydown) ;
		
		document.getElementById("ts").addEventListener('keyup', keyup) ;
		
		//$("body").on('keydown', keydown) ;
		

		document.getElementById("sfButton").addEventListener("click", async function() {
			save() ;
		}) ;


		document.getElementById("replace").addEventListener("click", async function() {

			if (foundIndex < 0) {
				showSnackBar("cant replace - no text found") ;
				return ;
			}

			let newVal = document.getElementById("replaceText").value ;
			console.log("replace at " + foundIndex + ": " + newVal) ;

			let ele = document.getElementById("w" + idToCword[foundIndex].id) ;
			ele.innerText = newVal ;
			idToCword[foundIndex].e.e = newVal ;
			setSaveTranscriptButton(true) ;
			foundIndex = -1 ;
			
			let event = new Event('click', {
				'bubbles': true
			});
			document.getElementById("findNext").dispatchEvent(event) ;
			
		}) ;
			

		document.getElementById("replaceAll").addEventListener("click", async function() {

			foundIndex = -1 ;
			findStartingWord = 0 ;
			let foundCount = 0 ;

			let findText = document.getElementById("findText").value ;
			let newVal = document.getElementById("replaceText").value ;
			if (newVal.length ==0) {
				if (!confirm("Are you sure you want to replace all occurrences of " + findText + " with nothing?")) return ;
			}

 			console.log("in replaceAll ")  ;
			for (let i = 1;i<idToCword.length;i++) {
				let e = idToCword[i].e ;
				if (e.hasOwnProperty("e")) {	// has an edit
					if (e.e != findText) continue ;
				}
				else if (e.t != findText) continue ;

				console.log("found text " + findText + " at i " + i + " obj " + JSON.stringify(idToCword[i])) ;

				// found!

				let ele = document.getElementById("w" + idToCword[i].id) ;
				ele.innerText = newVal ;
				idToCword[i].e.e = newVal ;

				foundCount++ ;
			}
			if (foundCount == 0) showSnackBar(findText + " not found") ;
			else {
				showSnackBar("" + foundCount + " occurrence(s) of " + findText + " changed to " + newVal) ;
				setSaveTranscriptButton(true) ;
			}
 
		}) ;


		document.getElementById("findNext").addEventListener("click", async function() {

			foundIndex = -1 ;
			let findText = document.getElementById("findText").value ;
			while (true) { // may try twice for wrap
				console.log("in find findStartingWord " + findStartingWord) ;
				for (let i = findStartingWord;i<idToCword.length;i++) {
					if (i == 0) continue ; // starts at 1
					let e = idToCword[i].e ;
					if (e.hasOwnProperty("e")) {	// has an edit
						if (e.e != findText) continue ;
					}
					else if (e.t != findText) continue ;

					console.log("found text " + findText + " at i " + i + " obj " + JSON.stringify(idToCword[i])) ;
					// found!

					let ele = document.getElementById("w" + idToCword[i].id) ;

					ele.scrollIntoView({ behavior: "smooth"}) 

					foundIndex = i ;
					findStartingWord = i + 1 ;
					let event = new Event('click', {
							'bubbles': true
						});
					ele.dispatchEvent(event) ;
					ele.focus() ;
					console.log("found word at " + i) ;
					return ;

				}
				if (findStartingWord == 0) {
					showSnackBar(findText + " not found") ;
					return ;
				}
				findStartingWord = 0 ;
				showSnackBar("Wrapping find to start") ;
			}
		}) ;
		/*
XXXXXXXX
		<div style='width:5em;display:inline-block'>Find: </div> <input type="text" size="8" id="findText"> <BUTTON id='findNext'>Find next</BUTTON><BR/>
		<div style='width:5em;display:inline-block'>Replace: </div> <input type="text" size="8" id="replaceText">
		 <BUTTON id='replaceAll'>Replace All</BUTTON>    <BUTTON id='replace'>Replace</BUTTON>
*/


		
		//$("#description").html(TRANSCRIPT_NAME) ;
		await loadTranscript(TRANSCRIPT_ID) ;	
		loadAudio(TRANSCRIPT_ID) ;
		
		console.log("transcript loaded, about to initListeners") ;
		initListeners() ;
		//setTimeout(initListeners, 1000) ;	// wtf?  yes, if we attempt the dblclick keyup etc listeners immediately, they dont find the elements !?
		
		console.log("load event done") ;
	}) ;

	/* hinton $(function() {
	
		howToDialog = $("#howTo").dialog({
			autoOpen: false, modal: true,
			width: '75%', height: '650'

		}) ;
		
		$("#sfButton").button().on("click", function() {
			save() ;
		}) ;

		$("#showHowTo").button().on("click", function() {
			howToDialog.dialog("open") ;
		}) ;
		
		speakerDialog = $("#popupSpk").dialog({
			autoOpen: false, modal: true,
			width: '400', height: '400',			
			open: function() {	// hack to close if clicked "outside" the modal
				jQuery('.ui-widget-overlay').bind('click', function() {
					jQuery('#popupSpk').dialog('close') ;
				})
			}
		}) ;
		
		window.onbeforeunload = confirmExit;
		function confirmExit() {
			if (unsavedChanges) {
				return "You have made changes to the features on this map but not saved them yet.  Do you wish to discard your changes?" ;
			}
		}
		
		setSaveTranscriptButton(false) ;

		$("#SyncTranscript").change(function() {
			if (this.checked) {
				syncTranscript = true ;			
				showSnackBar("The transcript will now automatically scroll to match the audio") ;
			}
			else {
				syncTranscript = false ;
				showSnackBar("Automatic scrolling of the transcript has been disabled") ;
			}				
		}) ;
		 
		$("#ts").on('keydown', keydown) ;
		$("#right").on('keydown', keydown) ;
		$("#headerDiv").on('keydown', keydown) ;
		$("#nlaBanner").on('keydown', keydown) ;
		$("#audioDiv").on('keydown', keydown) ;
		
		$("#ts").on('keyup', keyup) ;
		
		//$("body").on('keydown', keydown) ;
		
		
		//$("#description").html(TRANSCRIPT_NAME) ;
		loadTranscript(TRANSCRIPT_ID) ;	
		loadAudio(TRANSCRIPT_ID) ;
		
		setTimeout(initListeners, 1000) ;	// wtf?  yes, if we attempt the dblclick keyup etc listeners immediately, they dont find the elements !?
		
		
	});
	*/
	
	function initListeners() {
	
		console.log("in initListeners") ;
		console.log(" num of w1 eles: " + document.getElementsByClassName("w1").length) ;

		document.addEventListener('click', function (ev) {
   
			console.log("got click class " + ev.target.className + " list " + ev.target.classList) ;
			if (ev.target.classList) {
				for (let cn of ev.target.classList)
				if (cn == 'spkName') {
					shspkMenu(ev.target) ;
					break ;
				}
			}
		}) ;
				

		document.addEventListener('dblclick', function (ev) {
   
			console.log("got dblclick");
			if (ev.target.classList.contains('w1')) { //className == 'w1') 
				let e = ev.target ;
				const wid = e.id.substring(1) ;	// strip the w
				const wordObj = idToCword[wid] ;
	
				console.log(" wordObj=" + JSON.stringify(wordObj)) ;
				const seekTo = (wordObj.s - 0) / 100 ;
				console.log("seeked to " + seekTo)
				audioEle.currentTime = seekTo ;
				if (audioEle.paused) audioEle.play() ;
				ev.stopPropagation() ;
			}
		}) ;

		document.addEventListener('keyup', function (ev) {
   
			if ("findText" == ev.target.id) {	// changed the findtext box - reset starting word
				findStartingWord = 0 ;
				return ;
			}

			console.log("got keyup classes " + ev.target.classList);
			if (ev.target.classList.contains('w1')) { //className == 'w1') {
				let e = ev.target ;
				const wid = e.id.substring(1) ;	// strip the w
				const wordObj = idToCword[wid] ;
				console.log("kp wid=" + wid + " contents=" + e.textContent + " wo=" + JSON.stringify(wordObj)) ;
				if (e.textContent == wordObj.e.t) {	// not innerHTML!
					// no change - was it diff before?
					console.log(" no change and e is " + wordObj.e.e)
					if (wordObj.e.e) {	// yes..
						// hinton $("#w" + wid).removeClass("wChanged") ;
						document.getElementById("w" + wid).classList.remove("wChanged") ;
						delete(wordObj.e.e) ;				
					}
				}
				else {	// different from orig value
					console.log(" change and e is " + wordObj.e.e)
					// hiinton if (!wordObj.e.e) $("#w" + wid).addClass("wChanged") ;	// first change
					if (!wordObj.e.e) document.getElementById("w" + wid).classList.add("wChanged") ;	// first change

					wordObj.e.e = e.textContent ;	
					setSaveTranscriptButton(true) ;
				}
				ev.stopPropagation() ;

			}
		}) ;		


		document.addEventListener('keypress', function (ev) {

			console.log("got keypress target " + ev.target + " classlist " + ev.target.classList + " id " + ev.target.id);
			if (ev.target.id && ev.target.id.startsWith("rb-spk")) {
				spkKeyPress(ev) ;
				return ;
			}
			if (ev.target.classList) {
				for (let cn of ev.target.classList) {
					if ((cn == 'spks') || (cn == 'rb-new')) {
						spkKeyPress(ev) ;
						break ;
					}
				}
			}
		}) ;


		document.addEventListener('change', function (ev) {

			console.log("got change");

			if (ev.target.className == "verifiedSwitch") setSaveTranscriptButton(true) ;

			if ("radio" == ev.target.type) {
				if (ev.target.classList) {
					for (let cn of ev.target.classList)
					if (cn == 'spks') {

						var chosen = ev.target.value ;
						console.log("RADIO CHOSN " + chosen) ;
						const spkNum = chosen.substring(3) ;
						if (spkNum == maxSpk) {
							console.log("new speaker selected " + document.getElementById("rb-new").value) ;
							if (document.getElementById("rb-new").value.trim().length < 1) {
								console.log("pending new name input..") ;
								return ;
							}
							processSpeakerSelection(spkNum) ;
						}
						else processSpeakerSelection(spkNum) ;

						break ;
					}
				}
			}
		}) ;	


		console.log("done initListeners") ;

/* hinton
		console.log(" num of w1 eles: " + $(".w1").length)
		$(".w1").dblclick(function() {
		
			const wid = this.id.substring(1) ;	// strip the w
			const wordObj = idToCword[wid] ;

			console.log(" wordObj=" + JSON.stringify(wordObj)) ;
			const seekTo = (wordObj.s - 0) / 1000 ;
			console.log("seeked to " + seekTo)
			audioEle.currentTime = seekTo ;
			if (audioEle.paused) audioEle.play() ;
		}) ;
		
	
		$(".w1").keyup(function() {

			const wid = this.id.substring(1) ;	// strip the w
			const wordObj = idToCword[wid] ;
			console.log("kp wid=" + wid + " contents=" + this.innerHTML + " wo=" + JSON.stringify(wordObj)) ;
			if (this.innerHTML == wordObj.e.t) {
				// no change - was it diff before?
				console.log(" no change and e is " + wordObj.e.e)
				if (wordObj.e.e) {	// yes..
					$("#w" + wid).removeClass("wChanged") ;
					delete(wordObj.e.e) ;				
				}
			}
			else {	// different from orig value
				console.log(" change and e is " + wordObj.e.e)
				if (!wordObj.e.e) $("#w" + wid).addClass("wChanged") ;	// first change
				wordObj.e.e = this.innerHTML ;	
				setSaveTranscriptButton(true) ;
			}
		}) ;
	
		//const ele = "<span id='w" + wid + "' class='w1' ondblclick='cw()' onkeyup='kp()' contenteditable='true'>" + 
		*/
	} 
	
	function shspkMenu(e) {	// click on speaker

		console.log("shspkMenu " + e) ;
		//alert("shspkMenu not impl") ;

		//document.querySelector("input[name='spks']",
		

		
		document.getElementById("spkall").checked = false ; 	// force OFF the change all check box!
		
		currentSpeakerEleForChange = e ;
		
		var spk = getSpeakerFromClassnames(currentSpeakerEleForChange) ; // .parentElement.parentElement) ;
		const spkNum = spk.substring(3) ;
				
		console.log("shspkMenu spk: " + spk + " num " + spkNum) ;

		var s = "<input type='hidden' id='oldSpk' value='" + spkNum + "'/>" ;
		
		for (let i=0;i<maxSpk;i++) {
			var isCurrent = (i == spkNum) ;
			const rbId = "rbId" + i ;
			s+= "<input type='radio' name='spks' class='spks' id='" + rbId + "' value='spk" + i + "'" ;			
			s+= (isCurrent) ? " checked='checked'" : "" ;
			s+= "> <label for='" + rbId + "'><span id='rb-spk" + i + "' " ;
			s += " contenteditable='true' " ;
			s+= ">" + lookupSpeaker("spk" + i) + "</span></label><br/>"
		}
		s+= "<input type='radio' name='spks' class='spks' value='spk" + maxSpk + "'> " +
			" <input type='text' size='16' id='rb-new' class='rb-new' placeholder='new speaker name' >" ;
		
		console.log("built speaker list " + s) ;
		document.getElementById("speakerList").innerHTML = s ;
		document.getElementById("spkCurrent").innerHTML = lookupSpeaker("spk" + spkNum) ;
		
		document.getElementById("popupSpk").showModal() ;
		//speakerDialog.dialog("option", "position", { my: "left top", at: "right top", of: e }) ;
		//speakerDialog.dialog("open") ;
		
		/* hinton
		$("input[type=radio][name=spks]").unbind() ;
		
		$("#spkall").prop('checked', false) ; 	// force OFF the change all check box!
		
		currentSpeakerEleForChange = $(e) ;
		
		var spk = getSpeakerFromClassnames(currentSpeakerEleForChange.parent().parent().parent()) ;
		const spkNum = spk.substring(3) ;
				
		console.log("spk: " + spk + " num " + spkNum) ;

		var s = "<input type='hidden' id='oldSpk' value='" + spkNum + "'/>" ;
		
		for (let i=1;i<=maxSpk;i++) {
			var isCurrent = (i == spkNum) ;
			const rbId = "rbId" + i ;
			s+= "<input type='radio' name='spks' class='spks' id='" + rbId + "' value='spk" + i + "'" ;			
			s+= (isCurrent) ? " checked='checked'" : "" ;
			s+= "> <label for='" + rbId + "'><span id='rb-spk" + i + "' " ;
			if (i > 1) s += " contenteditable='true' onkeypress='spkKeyPress(event)'" ;
			s+= ">" + lookupSpeaker("spk" + i) + "</span></label><br/>"
		}
		s+= "<input type='radio' name='spks' class='spks' value='spk" + (maxSpk + 1) + "'> " +
			" <input type='text' size='16' id='rb-new' placeholder='new speaker name' onkeypress='spkKeyPress(event)'>" ;
		
		$("#speakerList").html(s) ;
		$("#spkCurrent").html(lookupSpeaker("spk" + spkNum)) ;
		
		
		speakerDialog.dialog("option", "position", { my: "left top", at: "right top", of: e }) ;
		speakerDialog.dialog("open") ;
		
		$('input[type=radio][name=spks]').change(function () {
		
			var chosen = this.value ;
			console.log("RADIO CHOSN " + chosen) ;
			const spkNum = chosen.substring(3) ;
			if (spkNum > maxSpk) {
				console.log("new speaker selected " + $("#rb-new").val()) ;
				if ($("#rb-new").val().trim().length < 1) {
					console.log("pending new name input..") ;
					return ;
				}
				processSpeakerSelection(spkNum) ;
			}
			else processSpeakerSelection(spkNum) ;
		}) ;		
		*/
	}
	
	function spkKeyPress(e) {
	
		var key = e.keyCode || e.which ;
		console.log("in spkKeyPress key=" + key) ;
		if (key !== 13) return ;
		e.preventDefault() ;
		// which radio button is selected?
		let radioButtons = document.querySelectorAll('input[name="spks"]') ;
		for (const rb of radioButtons) {
			if (rb.checked) {
				processSpeakerSelection(rb.value.substring(3)) ;
			}
		}
	
		/* hinton
		var spkrChecked = $('input[type=radio][name=spks]:checked').val() ;
		console.log("in spkkeypress, spkrChecked=" + spkrChecked ) ;
		const spkNum = spkrChecked.substring(3) ;
		processSpeakerSelection(spkNum) ;		
		*/
	}
	
	function processSpeakerSelection(spkNum) {
		
		console.log("in processSpeakerSelection spkNum:" + spkNum) ;
		const oldSpkNum = document.getElementById("oldSpk").value ;
		console.log("in processSpeakerSelection oldSpkNum:" + oldSpkNum) ;
		setSaveTranscriptButton(true) ;
		console.log("*** processSpeakerSelection, oldSpkNum=" + oldSpkNum + ", new spk num=" + spkNum) ;

		var newName = document.getElementById("rb-new").value.trim() ;
		// check content editable and new text..
		if (spkNum == maxSpk) { // theyve selected new speaker - make sure it has a name
			if (newName.length < 1) {
				alert("enter a name for the new speaker") ;
				return ;
			}
		}

		// have any of the names changed?
		for (let i=0;i<maxSpk;i++) { // start at 2 coz #1 is unknown speaker}
			const existingName = lookupSpeaker("spk" + i) ;
			const editedName = document.getElementById("rb-spk" + i).innerText ;
			if (existingName != editedName) {
				console.log("DIFF NAME editedName="+editedName +  " was " + existingName) ;
				speakerList["spk" + i] = editedName ;
				for (let se of document.querySelectorAll(".spkName.spk" + i )) {
					se.innerText = editedName ;
				}
			}			
		}		
		
		// ok, any new speaker name?
		if (newName.length > 0) {			
			const spkKey = "spk" + maxSpk ;
			speakerList[spkKey] = newName ;
			maxSpk++ ;
		}	
		
		const newSpeakerName =  lookupSpeaker("spk" + spkNum) ;
		const changeAll = document.getElementById("spkall").checked ;
		console.log("changeAll="+ changeAll + ", newSpeakerName="+newSpeakerName) ;
		
		
		if (changeAll) {		
			
			for (let se of document.querySelectorAll(".spkName.spk" + oldSpkNum )) {
				se.innerText = newSpeakerName ;
				se.classList.remove("spk" + oldSpkNum) ;
				se.classList.add("spk" + spkNum) ;
				let p = se.parentElement.parentElement ;
				p.classList.remove("spk" + oldSpkNum) ;
				p.classList.add("spk" + spkNum) ;
			}
		}
		else {	// just this ele
		
			currentSpeakerEleForChange.innerText = newSpeakerName ;
			currentSpeakerEleForChange.classList.remove("spk" + oldSpkNum) ;
			currentSpeakerEleForChange.classList.add("spk" + spkNum) ;
			let p = currentSpeakerEleForChange.parentElement.parentElement ;
			p.classList.remove("spk" + oldSpkNum) ;
			p.classList.add("spk" + spkNum) ;

			// hinton ?? currentSpeakerEleForChange.parent().parent().parent().removeClass("spk" + oldSpkNum).addClass("spk" + spkNum) ;
		}

		console.log("done") ;	
		document.getElementById("popupSpk").close() ;




		/* hinton

		const oldSpkNum = $("#oldSpk").val() ;
		setSaveTranscriptButton(true) ;
		console.log("*** processSpeakerSelection, oldSpkNum=" + oldSpkNum + ", new spk num=" + spkNum) ;
		
		var newName = $("#rb-new").val().trim() ;
		// check content editable and new text..
		if (spkNum > maxSpk) { // theyve selected new speaker - make sure it has a name
			if (newName.length < 1) {
				alert("enter a name for the new speaker") ;
				return ;
			}
		}
		
		// have any of the names changed?
		for (let i=2;i<=maxSpk;i++) { // start at 2 coz #1 is unknowm speaker}
			const existingName = lookupSpeaker("spk" + i) ;
			const editedName = $("#rb-spk" + i).text() ;
			if (existingName != editedName) {
				console.log("DIFF NAME editedName="+editedName +  " was " + existingName) ;
				speakerList["spk" + i] = editedName ;
				$(".spkName.spk" + i +" a").text(editedName) ;
			}			
		}		
		
		// ok, any new speaker name?
		if (newName.length > 0) {
			maxSpk++ ;
			const spkKey = "spk" + maxSpk ;
			speakerList[spkKey] = newName ;
		}	
		
		const newSpeakerName =  lookupSpeaker("spk" + spkNum) ;
		const changeAll = $("#spkall").is(':checked') ;
		console.log("changeAll="+ changeAll + ", newSpeakerName="+newSpeakerName) ;
		

		
		if (changeAll) {		
			
			$(".spkName.spk" + oldSpkNum +" a").text(newSpeakerName) ;
			$(".spk" + oldSpkNum).removeClass("spk" + oldSpkNum).addClass("spk" + spkNum) ;
		}
		else {	// just this ele
		
			currentSpeakerEleForChange.text(newSpeakerName) ;
			currentSpeakerEleForChange.parent().removeClass("spk" + oldSpkNum).addClass("spk" + spkNum) ;
			currentSpeakerEleForChange.parent().parent().parent().removeClass("spk" + oldSpkNum).addClass("spk" + spkNum) ;
		}

		console.log("done") ;	
		speakerDialog.dialog("close") ;
		*/
	}


	function keyup (e) {

		var keycode = e.keyCode || e.which ;
		console.log("keyup " + keycode + " e.shiftKey " + e.shiftKey + " altKey " + e.altKey) ;	// tab 9, |\ 220
		if (keycode == 192) { // split para key, the `~ key.  Was alt-p ((keycode == 80) &&  e.altKey) { // alt p = split
			console.log("SPLIT e:" + e + " target " + e.target) ;
			if (e.target && e.target.id && (e.target.id.indexOf("w") == 0)) {
				e.stopPropagation() ;
				const wwid = e.target.id ;
				const wid = e.target.id.substring(1) ;
				console.log("split at wid " + wid + ", " + JSON.stringify(idToCword[wid])) ;
				const pos = binarySearch(wordsByTS, idToCword[wid].s) ;
				console.log(" found at " + pos) ;
				
				// split at this pos - this pos word will start a new speaker section
				// this wordobj and all others in the chunk move to a new chunk started by a new ts1 timestamp
				
				const pivotEle = document.getElementById(wwid) ; // hinton $("#" + wwid) ;
				console.log("Pivot ele inner" + pivotEle.innerHTML) ;
				pivotEle.innerText = pivotEle.innerText.replace("`", "") ; // remove that pesky character!
				const currentWords = pivotEle.parentElement ;
				
				// cant split at first word - would leave empty chunk!!
				
				const currentWordsChildren = currentWords.children ;
				if (currentWordsChildren[0].id == wwid) {
					alert("cant split here!") ;
					return ;
				}
				
				const pivotWordObj = wordsByTS[pos] ;
				const wordsId = "words-" + Math.floor(Math.random() * 100000000) ;
				
				// get the speaker from the sibling with class speaker nearest to us but before us
				
				const currentSpeakerEle = currentWords.parentElement ;						
				var spk = getSpeakerFromClassnames(currentSpeakerEle) ;
				
				console.log("splitting spk=" + spk + " pos " + pos + " pivotWordObj " + JSON.stringify(pivotWordObj)) ;
				const newTs1AndWords =
								"<div class='speaker " + spk + "'>" +
									"<div class='spkTime'>" +

										"<div class='ts'>" + formatTime(pivotWordObj.s) + "</div>" +
																				
										"<div class='verified'><label class='switchSml'>" +
											"<input type='checkbox' class='verifiedSwitch' title='verified status'>" +
											//	"onchange='setSaveTranscriptButton(true)' value='0'>" +
											"<span class='sliderSml round'></span></label></div>" +

										"<div class='spkName " + spk + "'>" + // <a href='#' onclick='shspkMenu(this)'>" +
											lookupSpeaker(spk) + "</div>" +

									"</div>" +
									"<div class='words' id='" + wordsId + "'></div></div>" ;
								
											
				currentSpeakerEle.insertAdjacentHTML("afterEnd", newTs1AndWords) ;
				const newWords = document.getElementById(wordsId) ; // hinton $("#" + wordsId)  ;

				const oldContentList = currentWords.children ; // hinton contents() ;
				var foundStart = false ;
				let elesToMove = [] ;
				for (let i=0;i<oldContentList.length;i++) {
					var c = oldContentList[i] ;
					if (!foundStart) {
						if (c.nodeType != 1) continue ;
						// may be the span we are looking for ?
						if (c.id == wwid) foundStart = true ;
						else continue ;
					}
					elesToMove.push(c) ;

				}
				for (let c of elesToMove) newWords.append(c) ;
				setSaveTranscriptButton(true) ;
				console.log("Done found=" + foundStart) ;					
			}
		}
	} 
	
	function getSpeakerFromClassnames(ele) {
	
		for (let c of ele.classList) {
			if (c == "spkName") continue ;
			if (c.indexOf("spk") == 0) return c ;
		}
		/* HINTON
		const classList = ele.attr('class').split(/\s+/) ;
		for (let i=0;i<classList.length;i++)
			if (classList[i].indexOf("spk") == 0) return classList[i] ;
			*/
		return "spkDunno" ;
	}	

	function keydown (e) {
		var keycode = e.keyCode || e.which ;
		console.log("keydown " + keycode + " e.shiftKey " + e.shiftKey + " altKey " + e.altKey) ;	// tab 9, |\ 220
		if ((keycode == 37) || (keycode == 100)) { // left arrow, left arr num keypad
			//	console.log("SHIFT " + e.shiftKey) ;
			if (e.shiftKey) {
				e.preventDefault() ;
				advanceAudio(-3) ;	// back 3 sec
			}
		}
		else if ((keycode == 39) || (keycode == 102)) { // right arrow, right arr num keypad
			if (e.shiftKey) {
				e.preventDefault() ;
				advanceAudio(3) ;	// fwd 3 sec
			}
		}
		else if (keycode == 220) {	// | \ keyCode
			e.preventDefault() ;
			toggleAudioPlayPause() ;
		}
	} 
	
	function binarySearch(wordObjs, target) {
		var min = 0;
		var max = wordObjs.length - 1;
		while (min <= max) {
			var probe = (max + min) >> 1 ;
			var diff = target - wordObjs[probe].s ;
			if (diff > 0) min = probe + 1;
			else if (diff < 0) max = probe - 1;
			else {
				console.log("binary search found target " + target + " at probe " + probe) ;
				return probe ;
			}
    }
		console.log("binary search DID NOT FIND target (out of order?) " + target + "  min: " + min + " max : " + max) ;
		// HACK!! sheesh - amazingly, timestamps may be bogus (is this just from WhisperX)
		// ok - exhautive search around probe ;
		let offset = 1 ;
		max = wordObjs.length - 1 ;
		while (true) {
			let a = probe - offset ;
			let b = probe + offset ;
			if ((a < 0) && (b > max)) return -probe -1 ; // give up..
			if ((a >= 0) && (wordObjs[a].s = target)) return a ;
			if ((b <= max) && (wordObjs[b].s = target)) return b ;
		}
		//return -min - 1 ;	// nothing found - return insert point (made negative)
	}

	
	async function save() {	  

		console.log("in save " + new Error("in save").stack) ;
		document.getElementById("saveStatus").innerHTML = "Saving - please wait" ;
		
		const blob = {} ;
		const speakers = [] ;
		for (let i=0;i<maxSpk;i++) speakers.push({id: i, name: speakerList["spk" + i]}) ;
		
		blob.speakers = speakers ;
		
		const chunks = [] ;
		
		// ok, walk thru dom class chunk > class speaker (getting spk# class) > class words > span id=w# - use w# for idToCword
		// to get s (only used first in chunk) and e
		
		for (let chunk of document.querySelectorAll(".chunk")) {
			if (chunk.children.length == 0) {
				alert("Unexpected no children! chunk " + chunk.outerHTML) ;
				continue ;
			}

			// each child is a speaker (typically only 1 per chunk, I think..)

			for (let speaker of chunk.children) {

				var spk = getSpeakerFromClassnames(speaker) ;
				const spkNum = Number(spk.substring(3)) ;
				if (Number.isNaN(spkNum)) {
					alert("Cant find speaker " + speaker.outerHTML) ;
					return ;
				}
				
				const validated = speaker.children[0].children[1].children[0].children[0].checked ? 1 : 0 ;

				const chunk = {speaker: spkNum, validated: validated} ;		// validated - todo						
											
				const words = [] ;

				for (let wordEle of speaker.children[1].children) {
					if (!wordEle.classList || !wordEle.classList.contains("w1")) {
						alert("expected word, got " + wordEle.outerHTML) ;
						return ;
					}
					const wid = wordEle.id.substring(1) ;
					const cword = idToCword[wid] ;						
					const word = {s: cword.s, d: cword.d} ;
					if (typeof cword.e.e == 'string') {	// has been edited
						word.o = cword.e.t ;
						word.t = cword.e.e ;
					}
					else word.t = cword.e.t ;
					words.push(word) ;
					// console.log("  word " + wid) ;
					
				} ;
				//chunk.startms = chunkStartTime ; dont use this anymore hinton
				chunk.content = words ;
				chunks.push(chunk) ;
			} ;
		} ;
		
		blob.transcript = {chunks: chunks} ;
		console.log("saving blob " + JSON.stringify(blob)) ;
		// nb - we NEVER save or send  the id, metadata and history props - server manages this!

		
		// off to server !

		setSaveTranscriptButton(false) ;
		try {
			const response = await fetch("/correct/editedTranscript?id=" + TRANSCRIPT_ID, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(blob)
			});
	
			const result = await response.json() ;
			console.log("POST result " + result + " : " + ((result) ? JSON.stringify(result) : "")) ;
			if ("ok" == result.message) {
				document.getElementById("saveStatus").innerHTML = "Transcript last saved by <I>you</I> at " + formatDate(new Date() + " - reindexing may take 5 minutes") ;
				unsavedChanges = false ;
			}
			else throw Error("Save failed: " + ((result) ? JSON.stringify(result) : "Unknown error")) ;
		} 
		catch (error) {
			console.error("POST Error:", error) ;
			document.getElementById("saveStatus").innerHTML = "Last save failed: " + error ;
			unsavedChanges = true ;
			setSaveTranscriptButton(true) ;
		}		 	
	}
	
	async function loadTranscript(transcriptId) {	// may not be any..

    console.log("loadTranscript " + transcriptId) ;
		const resp = await fetch("/doc/transcriptJSON?id=" + transcriptId + "&nonce=" +(new Date())) ;
		const ts = await resp.json() ;
		renderTranscript(ts) ;
	
		/* fail
		const req = new Request("/doc/transcriptJSON?id=" + transcriptId + "&nonce=" +(new Date())) ;
		fetch(req)
			.then((response) => {
				if (response.status === 200) return response.json ;
				else throw new Error("Error getting transcriptId " + transcriptId) ;
			})
			.then((responseJSON) => {
				console.log("GOT RJ=" + responseJSON) ;
				renderTranscript(responseJSON) ;
			})
			.catch ((err) => {
				console.error("Error2 getting transcriptId " + transcriptId + " err: " + err) ;
			}) ;
*/
			/* hinton
		$.getJSON('/doc/transcriptJSON?id=' + transcriptId + '&nonce=' +(new Date()))
			.done(function (jsonStr) {
				console.log("GOT FEATURES " + jsonStr) ;
				let json = jsonStr ; //JSON.parse(jsonStr) ;
				renderTranscript(json) ;
				
				// TODO $("#saveStatus").html("" + json.features.length + " features last saved by <I>" + json.uid + "</I> at " + //formatDate(new Date(json.timestamp))) ;
				
			})
			.fail(function( jqxhr, textStatus, error ) {
					var err = textStatus + ", " + error ;
					console.log( "Request Failed: " + err) ;
			}) ;
			*/
	} ;
			
	
	function initChunk(chunk, contentIndex) {

		if (!chunk || !chunk.content) return null ;
		return {speaker: chunk.speaker, validated: chunk.validated, content: [chunk.content[contentIndex]]} ;
	}


	function convertSpeakerStringArray(speakerStringArray) {	// originally created as string array, which isnt robust for id refs

		let speakers = [] ;
		for (let i=0;i<speakerStringArray.length;i++) speakers.push({id:i, name:speakerStringArray[i]}) ;
		return speakers ;
	}

	function splitSingleChunk(bigSingleChunk) {

		let newChunks = [] ;

		// if active chunk is longer than 40 words AND word ends in ? or ! or more than 2 letters long
		// isnt Mr. Mrs. Ms. then start a new chunk

		let cc = initChunk(bigSingleChunk, 0) ;
		newChunks.push(cc) ;

		for (let i=1;i<bigSingleChunk.content.length;i++) {
			let c = bigSingleChunk.content[i] ;
			cc.content.push(c) ;
			if ((i < (bigSingleChunk.content.length - 3)) && (cc.content.length > 40)) {
				let testStr = "" + c.t ; // force stringness
				if (testStr.endsWith("!") || testStr.endsWith("?") ||
					 (testStr.endsWith(".") && (testStr != "Mr.") && (testStr!= "Mrs.") && (testStr != "Ms.") 
					 	&& testStr.length > 2)
				) {
					cc = initChunk(bigSingleChunk, i+1) ;
					newChunks.push(cc) ;
					i++ ; // tricky - skip next coz we have just incorporated it
				}
			}
		}
		return newChunks ;
	}

	function renderTranscript(ts) {
	
		console.log("in rt + with " + JSON.stringify(ts)) ;
		const tsEle = document.getElementById("ts") ;
		
		if (!Array.isArray(ts.speakers) || (ts.speakers.length == 0)) ts.speakers = [{id:0, name:'Speaker unknown'}] ; // null or silly
		else if (typeof ts.speakers[0] == "string") ts.speakers = convertSpeakerStringArray(ts.speakers) ;

		const speakers = ts.speakers ;


		for (let s=0;s<speakers.length;s++) {
			const speaker = speakers[s] ;
			speakerList["spk" + speaker.id] = speaker.name ;
		}			
		
		console.log("loaded " + speakers.length + " speakers") ;
		maxSpk = speakers.length ;
		
		const histories = ts.history ;
		var histEle = document.getElementById("history") ;
		let historyContents = "" ;
		for (let s=0;s<histories.length;s++) {
			const h = histories[s] ;
			historyContents =  "<P>" + h + "</P>" + historyContents ;
			// hinton histEle.prepend("<P>" + new Date(h.timestamp) + " by " + h.user + ": " + h.type) ;
		}
		histEle.innerHTML = historyContents ;

		let s = "" ;
		if (ts.transcript.chunks.length == 1) ts.transcript.chunks = splitSingleChunk(ts.transcript.chunks[0]) ;

		const chunks = ts.transcript.chunks ;
		for (let c=0;c<chunks.length;c++) {
			const chunk = chunks[c] ;
			const spkNum = chunk.speaker ;
			//const startms = chunk.startms ;
      const startcs = chunk.content[0].s ; // hinton
			const spk = "spk" + spkNum ;		
			s += "<div id='c" + startcs + "' class='chunk'>" +
						"<div class='speaker " + spk + "'>" +
							"<div class='spkTime'>" +



								"<div class='ts'>" + formatTime(startcs) + "</div>" + 								
								
								"<div class='verified'><label class='switchSml'>" +
											"<input type='checkbox' class='verifiedSwitch' title='verified status' " +
											// HINTON 	"onchange='setSaveTranscriptButton(true)' value='0'" +
												((chunk.validated > 0) ? " checked='checked'" : "") +	
												">" +
											"<span class='sliderSml round'></span></label></div>" +									
		
								"<div class='spkName " + spk + "'>" + /* <a href='#' " + onclick='shspkMenu(this)' HINTON ">"*/
								lookupSpeaker(spk) +
								// HINTON "</a>" +
								"</div>" +											
							"</div>" +									
							"<div class='words'>" ;	
									
			const words = chunk.content ;
			for (let w=0;w<words.length;w++) {
				const word = words[w] ;
				wid++ ;
				//const ele = "<span id='w" + wid + "' class='w1' ondblclick='cw()' onkeyup='kp()' contenteditable='true'>" + 
				const ele = "<span id='w" + wid + "' class='w1' contenteditable='true'>" + 
					word.t + "</span>&#8203;" ; // that's a zero-width space
				const wordObj = {id:wid, s: word.s, e:word, d: word.d} ;
				idToCword[wid] = wordObj ;
				wordsByTS.push(wordObj) ; // list of start cs for each word, ordered by ts
				s += ele ;
			}
			s += "</div></div></div>" ;
			// hinton tsEle.append(s) ;		// hinton - ?	
		}
		tsEle.innerHTML = s ;
	}
	
	function loadAudio(transcriptId) {
	
    console.log("loadAudio " + transcriptId) ;

		const audioLocation = "public/audio/mp3/" + transcriptId + ".mp3" ;
		const audio = "<audio id='audioEle' controls autoplay playsinline=''" + 
			// hinton ontimeupdate='timeUpdate()' 
			" style='width:100%'>" +
			"<source src='/listen/" + transcriptId + "' type='audio/mpeg'>" +
			"Your browser will not play audio" +
			"</audio>" +

			"<div id='audioDebug' style='margin-top:1em;font-size:60%'></div>" ;


			
		document.getElementById("audioDiv").innerHTML = audio ;

		audioEle = document.getElementById("audioEle") ;
		audioDebug = document.getElementById("audioDebug") ;

		audioEle.addEventListener("timeupdate", timeUpdate) ;

	// wont work any more - autoPlay is verboten	audioEle.autoplay = true ;
		audioEle.currentTime = startSec ;
		//audioEle.play() ;

		/* hinton $("#audioDiv").append(audio) ;	

		audioEle = $("#audioEle")[0] ;
		audioDebug = $("#audioDebug")[0] ;			
		*/
	}
	
	var lastwordsByTSIndex = 0 ;
	var lastTime = 0 ;
	var lastMarkedCurrentWordId = null ;
	
	function timeUpdate() {
	
	//todo - i buggered this I think removing dup timestamp from wordobj?
	
		/*if (!audioEle) {
			audioEle = $("#audioEle")[0] ;
			audioDebug = $("#audioDebug")[0] ;
		}*/
		
		const aTime = audioEle.currentTime ;
		audioDebug.innerHTML = "current time: " + aTime ;
	//	console.log("in tupd aTime " + aTime + " lastTime " + lastTime + " lastMarkedCurrentWord " + lastMarkedCurrentWordId)
		var probe = lastwordsByTSIndex ; 	// where we start probing
		var incr ;							// direction: -1 for back +1 for fwd
		const cs = Math.round(aTime * 100) ;
		if (cs < lastTime) {
			if (cs < 100) {
				probe = 0 ;
				incr = -1 ;
			}
			else incr = -1 ;
		}
		else incr = 1 ;
		
		// todo - test on empty word list
		
		var max = wordsByTS.length ;
		if (incr > 0) {	// go forward until ts > aTime, then go back one
			while (probe < max) {
				if (wordsByTS[probe].s > cs) {
					if (probe > 0) probe-- ;
					markWord(probe, cs) ;
					return ;
				}
				probe++ ;
			}
			
			markWord(max-1, cs) ; // hmm... peg at the end (probe may be -1 if empty!!)
			return ;
		}
		
		// go back until ts <= cs
		while (probe >= 0) {
			if (wordsByTS[probe].s <= cs) {
				markWord(probe, cs) ;
				return ;
			}
			probe-- ;
		}
		markWord(0, cs) ;
	}
	
	
	function advanceAudio(sec) {
	
		var toSec = audioEle.currentTime + sec ;
		if (toSec < 0) toSec = 0 ;
		else if (toSec > audioEle.duration) toSec = audioEle.duration ;
		audioEle.currentTime = toSec ;
		if (audioEle.paused) audioEle.play() ;
		showSnackBar("Audio set to " + formatTime(100 * Math.round(toSec))) ;
	}
	
	function toggleAudioPlayPause() {
	
		if (audioEle.paused) {
			audioEle.play() ;
			showSnackBar("Audio resumed") ;
		}
		else {
			audioEle.pause() ;
			showSnackBar("Audio paused") ;		
		}
	}
		
		
	
	function markWord(wordsByTSindex, ms) {
	
		//audioDebug.innerHTML = audioDebug.innerHTML  + " wordsByTSindex= " + wordsByTSindex ;
		if (wordsByTSindex < 0) return ; // give up..
		
		lastTime = ms ;
		lastwordsByTSIndex = wordsByTSindex ;

		// ok, find our ele
		const newCurrentWordEleId = "w" + wordsByTS[wordsByTSindex].id ;
		if (newCurrentWordEleId == lastMarkedCurrentWordId ) {
			//audioDebug.innerHTML = audioDebug.innerHTML  + " no change" ;			
		}
		else {
			if (lastMarkedCurrentWordId) document.getElementById(lastMarkedCurrentWordId).classList.remove("wCurrent") ;
			const ele = document.getElementById(newCurrentWordEleId) ;
			ele.classList.add("wCurrent") ;
			//console.log("marked word " + newCurrentWordEleId + " ele=" + ele.innerHTML) ;
			lastMarkedCurrentWordId = newCurrentWordEleId ;
			if (syncTranscript) {
				if (!isInViewport(ele))	ele.scrollIntoView({ behavior: "smooth"}) ;
			}

			/* hinton 
			if (lastMarkedCurrentWordId) $("#" + lastMarkedCurrentWordId).removeClass("wCurrent") ;
				
			const ele = $("#" + newCurrentWordEleId) ;
			ele.addClass("wCurrent") ;
			lastMarkedCurrentWordId = newCurrentWordEleId ;
			if (syncTranscript) ele.get(0).scrollIntoViewIfNeeded() ;
			*/
		}		
	}
	

	function isInViewport(element) {

    const rect = element.getBoundingClientRect() ;
    return (rect.top >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight)) ;
	}

	function formatTime(cs) {
	
		const hr = Math.floor(cs / 3600 / 100) ;
		const min = Math.floor((cs - (hr * 3600 * 100)) / 60 / 100) ;
		const sec =  Math.floor((cs - (hr * 3600 * 100) - (min * 60 * 100) + 50) / 100) ;
		return "" + pad(hr) + ":" + pad(min) + ":" + pad(sec) ;
	}
	
	function pad(n) {	// adds leading zero if 1 digit (assumes +ve!)
	
		if (n > 9) return n ;
		return "0" + n ;
	} 
		
	function formatDate(d) {
	
		return d.toLocaleString() ;		
	}
