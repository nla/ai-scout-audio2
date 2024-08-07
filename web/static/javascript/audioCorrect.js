  var unsavedChanges = false ;
	var wid = 0 ;	// each word span has a unique id based on this counter
	const idToCword =  new Array() ;
	const wordsByTS = new Array() ;
	
	var INTERVIEW_ID ; // ="nla.obj-212623729" ;
	var SESSION_ID ; // ="nla.obj-212623729" ;
	var startSec ; // = Number("3") ;

	var audioEle = null ;
	var audioDebug = null ;
	
	var syncTranscript = true ;
	
	var howToDialog ;
	var speakerDialog ;
	
	var maxSpk = -1 ;
	var currentSpeakerEleForChange = null ;
	
	const speakerList = {} ; // {spk1: "Speaker Unknown"} ;

	let undoStack = [] ;
	let undoPointer = 0 ;

  let undoButton = null ;
	let redoButton = null ;

	// freqList is the word frequency list (log scaled 0..100) loaded in our page's header

	function addUndo(entry) {

		undoStack.push(entry) ;
		undoPointer = undoStack.length ;
		showUndoRedo() ;
	}
	
	function showUndoRedo() {

		let lastUndoableAction = document.getElementById("lastUndoableAction") ;
		if (undoPointer > 0) {
			lastUndoableAction.innerHTML = renderUndoRedoAction(undoStack[undoPointer - 1]) ;
			undoButton.disabled = false ;
		}
		else {
			lastUndoableAction.innerHTML = "[ nothing to undo ]" ;
			undoButton.disabled = true ;
		}

		let nextRedoableAction = document.getElementById("nextRedoableAction") ;
		if ((undoPointer >= 0) && (undoPointer < undoStack.length)) {
			nextRedoableAction.innerHTML = 	renderUndoRedoAction(undoStack[undoPointer]) ;
			redoButton.disabled = false ;
		}
		else {
			nextRedoableAction.innerHTML = "[ nothing to undo ]" ;
			redoButton.disabled = false ;
		}
	}

	function renderUndoRedoAction(action) {

		switch (action.action) {
			case "replaceText":			return "Replaced word <B>" + action.origText + "</B> to <B>" + action.newText + "</B>" ;

			case "replaceAllText":	return "Replaced " + action.list.length + " words starting with <B>" + action.findText + "</B> to <B>" + action.replaceText + "</B>" ;

			case "wordChange":			return "Changed word <B>" + action.origText + "</B> to <B>" + action.newText + "</B>" ;

			//case	"replaceSpeakerName": return "Changed speaker name from <B>" + action.oldName + "</B> to <B>" + action.newName + "</B>" ;

			case	"replaceSpeaker":	
			{
				let descr = "" ;

				if (action.newSpeakerAction) descr = "New speaker <B>" + action.newSpeakerAction.name + "</B>; " ;

				if (action.replaceSpeakerNameAction) descr += " Changed speaker from <B>" + action.replaceSpeakerNameAction.oldName + "</B> to <B>" +
							action.replaceSpeakerNameAction.newName + "</B>; " ;

				if (action.eleList) descr += " Speaker Changed " +  + action.eleList.length + " time(s)" ;
					
				return descr ;
			}


		//	case "newSpeaker":			return "Add speaker <B>" + action.name + "</B>" ;																	 	

			default: 								return "Unknown action: " + JSON.stringify(action) ;
		}
	}


	function redo() {

		if (undoPointer < 0) return ;
		if (undoPointer >= undoStack.length) return ;

		let action = undoStack[undoPointer] ;
console.log("REDO: " + JSON.stringify(action));
		switch (action.action) {
			case "replaceText":	
			{
				let wordObj = idToCword[action.index] ;
				let ele = document.getElementById("w" + action.index) ;
				if (!ele.classList.contains("wChanged")) 	ele.classList.add("wChanged") ;	// changed now
				wordObj.e.e = action.newText ;
				ele.innerText = action.newText ;
				ele.scrollIntoView({ behavior: "smooth"}) 
				break ;
			}

			case "replaceAllText":	
			{
				for (let l of action.list) {
					let wordObj = idToCword[l.index] ;
					let ele = document.getElementById("w" + l.index) ;
					if (!ele.classList.contains("wChanged")) 	ele.classList.add("wChanged") ;	// changed now
					wordObj.e.e = l.newText ;
					ele.innerText = l.newText ;
					ele.scrollIntoView({ behavior: "smooth"}) 
				}
				break ;
			}

			case "wordChange":	
			{
				let wordObj = idToCword[action.index] ;
				let ele = document.getElementById("w" + action.index) ;
				if (!ele.classList.contains("wChanged")) 	ele.classList.add("wChanged") ;	// changed now
				wordObj.e.e = action.newText ;
				ele.innerText = action.newText ;
				ele.scrollIntoView({ behavior: "smooth"}) 
				break ;
			}

			case	"replaceSpeaker":	
			{
				if (action.newSpeakerAction) {
					speakerList[action.newSpeakerAction.spkKey] = action.newSpeakerAction.name ;
					maxSpk = action.newSpeakerAction.maxSpk + 1 ;
				}

				if (action.replaceSpeakerNameAction) {
					speakerList[action.replaceSpeakerNameAction.speakerListIndex] = action.replaceSpeakerNameAction.newName ;
					for (l of action.replaceSpeakerNameAction.eleList)
							l.innerText = action.replaceSpeakerNameAction.newName ;							
				}

				for (let l of action.eleList) {
					l.classList.remove("spk" + action.oldSpeakerNum) ;
					l.classList.add("spk" + action.newSpeakerNum) ;
					let p = l.parentElement.parentElement ;
					p.classList.remove("spk" + action.oldSpeakerNum) ;
					p.classList.add("spk" + action.newSpeakerNum) ;
					l.innerText = action.newSpeakerName ;
				}
				break ;
			}

			default: 
				alert("Unknown action: " + JSON.stringify(action)) ;
				return ;
		}

		// if we did an redo
		undoPointer++ ;

		showUndoRedo() ;

	}
	function undo() {

		if (undoPointer <= 0) return ;
		let action = undoStack[undoPointer - 1] ;
		switch (action.action) {
			case "replaceText":	
			{
				let wordObj = idToCword[action.index] ;
				let ele = document.getElementById("w" + action.index) ;
				if (!action.previousEdit) { // only change
					ele.classList.remove("wChanged") ;	// only change					
					delete(wordObj.e.e) ;	
				}
				else wordObj.e.e = action.previousEdit ;
				
				ele.innerText = action.origText ;
				ele.scrollIntoView({ behavior: "smooth"}) 
				break ;
			}

			case "replaceAllText":	
			{
				for (let l of action.list) {
					let wordObj = idToCword[l.index] ;
					let ele = document.getElementById("w" + l.index) ;
					if (!l.previousEdit) { // only change
						ele.classList.remove("wChanged") ;	// only change					
						delete(wordObj.e.e) ;	
					}
					else wordObj.e.e = l.previousEdit ;				
					ele.innerText = l.origText ;
					ele.scrollIntoView({ behavior: "smooth"}) 
				}
				break ;
			}

			case "wordChange":	
			{
				let wordObj = idToCword[action.index] ;
				let ele = document.getElementById("w" + action.index) ;
				if (!action.previousEdit) { // only change
					ele.classList.remove("wChanged") ;	// only change					
					delete(wordObj.e.e) ;	
				}
				else wordObj.e.e = action.previousEdit ;
				
				ele.innerText = action.origText ;
				ele.scrollIntoView({ behavior: "smooth"}) 
				break ;
			}


			case	"replaceSpeaker":	
			{

				if (action.newSpeakerAction) {
					delete speakerList[action.newSpeakerAction.spkKey] ;
					maxSpk = action.newSpeakerAction.maxSpk ;
				}

				if (action.replaceSpeakerNameAction) {
					speakerList[action.replaceSpeakerNameAction.speakerListIndex] = action.replaceSpeakerNameAction.oldName ;
					for (l of action.replaceSpeakerNameAction.eleList)
							l.innerText = action.replaceSpeakerNameAction.oldName ;	
				}

				for (let l of action.eleList) {
					l.classList.add("spk" + action.oldSpeakerNum) ;
					l.classList.remove("spk" + action.newSpeakerNum) ;
					let p = l.parentElement.parentElement ;
					p.classList.add("spk" + action.oldSpeakerNum) ;
					p.classList.remove("spk" + action.newSpeakerNum) ;
					l.innerText = action.oldSpeakerName ;
				}
				break ;
			}

			default: 
				alert("Unknown action: " + JSON.stringify(action)) ;
				return ;
		}

		// if we did an undo...
		undoPointer-- ;
		//undoStack.pop() ;

		showUndoRedo() ;
	}



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

		INTERVIEW_ID = document.getElementById("INTERVIEW_ID").value ;
		SESSION_ID = document.getElementById("SESSION_ID").value ;

		startSec = Number(document.getElementById("startSec").value) ;

		window.onbeforeunload = confirmExit ;

		setSaveTranscriptButton(false) ;

		undoButton = document.getElementById("undo") ;
		undoButton.disabled = true ;
		undoButton.addEventListener("click", undo) ;

		redoButton = document.getElementById("redo") ;
		redoButton.disabled = true ;
		redoButton.addEventListener("click", redo) ;

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

			let findText = document.getElementById("findText").value ;

			let newVal = document.getElementById("replaceText").value ;
			console.log("replace at " + foundIndex + ": " + newVal) ;

			let ele = document.getElementById("w" + idToCword[foundIndex].id) ;
			let e = idToCword[foundIndex].e ;

			let newText = null ;
			if (e.hasOwnProperty("e")) {	// has an edit
				newText = (e.e == findText) ? newVal : (newVal + e.e.substring(findText.length)) ;
			}
			else {
				newText = (e.t == findText) ? newVal : (newVal + e.t.substring(findText.length)) ;
			}
			addUndo({
				action:"replaceText",
				index: foundIndex,
				origText:ele.innerText,
				previousEdit: e.hasOwnProperty("e") ? e.e : null,
				newText: newText
			}) ;
		

			ele.innerText = newText ;
			idToCword[foundIndex].e.e = newText ;
			if (!ele.classList.contains("wChanged")) ele.classList.add("wChanged") ;


		//	let ele = document.getElementById("w" + idToCword[foundIndex].id) ;
		//	ele.innerText = newVal ;
		//	idToCword[foundIndex].e.e = newVal ;

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

			let undoAction = {
				action:"replaceAllText",
				findText: findText,
				replaceText: newVal,
				list: []
			} ;

 			console.log("in replaceAll ")  ;
			for (let i = 1;i<idToCword.length;i++) {
				let e = idToCword[i].e ;
				let newText = null ;
				if (e.hasOwnProperty("e")) {	// has an edit
					if (!e.e.startsWith(findText)) continue ;
					newText = (e.e == findText) ? newVal : (newVal + e.e.substring(findText.length)) ;
				}
				else {
					if (!e.t.startsWith(findText)) continue ;
					newText = (e.t == findText) ? newVal : (newVal + e.t.substring(findText.length)) ;
				}

				console.log("found text " + findText + " at i " + i + " obj " + JSON.stringify(idToCword[i])) ;

				// found!

				let ele = document.getElementById("w" + idToCword[i].id) ;

				undoAction.list.push({
					index: i,
					origText:ele.innerText,
					previousEdit: e.hasOwnProperty("e") ? e.e : null,
					newText: newText
				}) ;

				ele.innerText = newText ;
				idToCword[i].e.e = newText ;
				if (!ele.classList.contains("wChanged")) ele.classList.add("wChanged") ;

				foundCount++ ;
			}
			if (foundCount == 0) showSnackBar(findText + " not found") ;
			else {
				addUndo(undoAction) ;
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
					if (!e) {
						console.log(" no e at index " + i) ;
						continue ;
					}
				//	console.log(" i=" +i + " e=" + JSON.stringify(e)) ;
					if (e.hasOwnProperty("e")) {	// has an edit
						if (!e.e.startsWith(findText)) continue ;
					}
					//else if (!e.t) continue ;
					else if (!e.t.startsWith(findText)) continue ;

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


		
		//$("#description").html(TRANSCRIPT_NAME) ;
		await loadTranscript(INTERVIEW_ID, SESSION_ID) ;	
		loadAudio(INTERVIEW_ID, SESSION_ID) ;
		
		console.log("transcript loaded, about to initListeners") ;
		initListeners() ;
		//setTimeout(initListeners, 1000) ;	// wtf?  yes, if we attempt the dblclick keyup etc listeners immediately, they dont find the elements !?
		
		console.log("load event done") ;
	}) ;

	
	
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

				let currentUndoAction =  null ;
				if (undoPointer) {
					let t = undoStack[undoPointer - 1] ;
					if ((t.action == 'wordChange') && (t.index == wid)) // another edit on same word
						currentUndoAction = t ; 
				}

				if (e.textContent == wordObj.e.t) {	// not innerHTML!
					// no change - was it diff before?
					console.log(" no change and e is " + wordObj.e.e)
					if (wordObj.e.e) {	// yes..
						document.getElementById("w" + wid).classList.remove("wChanged") ;
						delete(wordObj.e.e) ;	
						
						if (currentUndoAction) {	// remove undo action
							undoPointer-- ;
							undoStack.pop() ; 
							showUndoRedo() ; // update display
						}
					}
				}
				else {	// different from orig value
					console.log(" change and e is " + wordObj.e.e)
					// hiinton if (!wordObj.e.e) $("#w" + wid).addClass("wChanged") ;	// first change
					if (!wordObj.e.e) document.getElementById("w" + wid).classList.add("wChanged") ;	// first change

					if (currentUndoAction) {
						currentUndoAction.newText = e.textContent ;
						showUndoRedo() ; // update display
					}
					else {
						addUndo({
							action:"wordChange",
							index: wid,
							origText: wordObj.e.t,
							previousEdit: wordObj.e.hasOwnProperty("e") ? wordObj.e.e : null,
							newText: e.textContent
						}) ;
					}					
						
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

		let replaceSpeakerNameAction = null ;
		// have any of the names changed?
		for (let i=0;i<maxSpk;i++) { // start at 2 coz #1 is unknown speaker}
			const existingName = lookupSpeaker("spk" + i) ;
			const editedName = document.getElementById("rb-spk" + i).innerText ;
			if (existingName != editedName) {
				console.log("DIFF NAME editedName="+editedName +  " was " + existingName) ;
				speakerList["spk" + i] = editedName ;

				replaceSpeakerNameAction = {
					action:"replaceSpeakerName",
					oldName: existingName,
					newName: editedName,
					speakerListIndex: "spk" + i,
					eleList: []
				} ;

				for (let se of document.querySelectorAll(".spkName.spk" + i )) {
					se.innerText = editedName ;
					replaceSpeakerNameAction.eleList.push(se) ;
				}
			}			
		}		
		
		let newSpeakerAction = null ;
		// ok, any new speaker name?
		if (newName.length > 0) {	
			
			const spkKey = "spk" + maxSpk ;

			newSpeakerAction =  {
				action:"newSpeaker",
				name: newName,
				spkKey: spkKey,
				maxSpk: maxSpk
			} ;

			speakerList[spkKey] = newName ;
			maxSpk++ ;
		}	
		
		const newSpeakerName =  lookupSpeaker("spk" + spkNum) ;
		const changeAll = document.getElementById("spkall").checked ;
		console.log("changeAll="+ changeAll + ", newSpeakerName="+newSpeakerName) ;
		

		let undoAction = {
			action:"replaceSpeaker",
			newSpeakerAction: newSpeakerAction,
			replaceSpeakerNameAction: replaceSpeakerNameAction,
			newSpeakerName: newSpeakerName,
			newSpeakerNum: spkNum,
			oldSpeakerName: (replaceSpeakerNameAction) ? replaceSpeakerNameAction.oldName : speakerList["spk" + oldSpkNum],
			oldSpeakerNum: oldSpkNum,
			eleList: []
		} 

		
		if (changeAll) {		
			
			for (let se of document.querySelectorAll(".spkName.spk" + oldSpkNum )) {
				undoAction.eleList.push(se) ;

				se.innerText = newSpeakerName ;
				se.classList.remove("spk" + oldSpkNum) ;
				se.classList.add("spk" + spkNum) ;
				let p = se.parentElement.parentElement ;
				p.classList.remove("spk" + oldSpkNum) ;
				p.classList.add("spk" + spkNum) ;
			}
		}
		else {	// just this ele
		
			undoAction.eleList.push(currentSpeakerEleForChange) ;

			currentSpeakerEleForChange.innerText = newSpeakerName ;
			currentSpeakerEleForChange.classList.remove("spk" + oldSpkNum) ;
			currentSpeakerEleForChange.classList.add("spk" + spkNum) ;
			let p = currentSpeakerEleForChange.parentElement.parentElement ;
			p.classList.remove("spk" + oldSpkNum) ;
			p.classList.add("spk" + spkNum) ;
		}

		if (undoAction.eleList || newSpeakerAction || replaceSpeakerNameAction) addUndo(undoAction) ;

		console.log("done") ;	
		document.getElementById("popupSpk").close() ;

	}


	function keyup (e) {

		var keycode = e.keyCode || e.which ;
		console.log("==> keyup " + keycode + " e.shiftKey " + e.shiftKey + " altKey " + e.altKey
					+ " ctrlKey " + e.ctrlKey) ;	// tab 9, |\ 220
		if (e.ctrlKey) {
			if (keycode == 59) {	// ctrl-semicolon - this word is good - set confidence to 100
				if (e.target && e.target.id && (e.target.id.indexOf("w") == 0)) {
					e.stopPropagation() ;
					const wwid = e.target.id ;
					const wid = e.target.id.substring(1) ;
					const cword = idToCword[wid] ;
					cword.e.c = 100 ;
					cword.c = 100 ;
					e.target.classList.add("wVerified") ;
					console.log("confirm GOOD at wid " + wid + ", " + JSON.stringify(idToCword[wid])) ;
					setSaveTranscriptButton(true) ;
					showSnackBar("word " + e.target.textContent + " verified") ;
				}
			}
			else if (keycode == 188) {	// ctrl-COMMA - this word is good, and all words the same - set confidence to 100
				if (e.target && e.target.id && (e.target.id.indexOf("w") == 0)) {
					e.stopPropagation() ;
					const wwid = e.target.id ;
					const wid = e.target.id.substring(1) ;
					const cword = idToCword[wid] ;
					cword.e.c = 100 ;
					cword.c = 100 ;
					e.target.classList.add("wVerified") ;
					console.log("confirm ALL GOOD at wid " + wid + ", " + JSON.stringify(idToCword[wid])) ;
					let verifiedWord = e.target.textContent ;
					count = 0 ;
					for (let cw of idToCword) {
						if (!cw) continue ;
						if ((cw.e.t == verifiedWord) && !cw.e.e) {
							cw.e.c = 100 ; // verified
							cw.c = 100 ;
							count++ ;
							document.getElementById("w" + cw.id).classList.add("wVerified") ;
						}
					}
					showSnackBar("All " + count + " instances of word " + verifiedWord + " verified") ;
					setSaveTranscriptButton(true) ;
				}
			}
			else if (keycode == 190) {	// ctrl-DOT - if this word has been edited, change all other instances
																// that have the same OLD value as this word to its new value
				if (e.target && e.target.id && (e.target.id.indexOf("w") == 0)) {
					e.stopPropagation() ;
					const wwid = e.target.id ;
					const wid = e.target.id.substring(1) ;
					const cword = idToCword[wid] ;
					if (!cword.e.e) {
						alert("This word has not been edited") ;
						return ;
					}
					let lookFor = cword.e.t ;
					let changeTo = cword.e.e ;
					count = 0 ;
					for (let cw of idToCword) {
						if (!cw) continue ;
						if ((cw.e.t == lookFor) && !cw.e.e) {
							cw.e.c = 100 ; // verified
							cw.c = 100 ;
							cw.e.e = changeTo ;
							count++ ;

							let ele = document.getElementById("w" + cw.id) ;
							ele.classList.add("wChanged") ;
							ele.textContent = changeTo ;
						}
					}
					if (count == 0) 
						alert("No other instances of " +  lookFor + " were changed to " + changeTo) ;						
					else {
						showSnackBar("Another " + count + " instances of word " + lookFor + " changed to " + changeTo) ;
						setSaveTranscriptButton(true) ;
					}
				}
			}			
		}
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
				
				const pivotEle = document.getElementById(wwid) ; 
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
				const newWords = document.getElementById(wordsId) ; 

				const oldContentList = currentWords.children ;
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
					if (cword.c) word.c = cword.c ;
					if (typeof cword.e.e == 'string') {	// has been edited
						word.o = cword.e.t ;
						word.t = cword.e.e ;
						word.c = 100 ; // if corrected, very confident!
					}
					else word.t = cword.e.t ;
					words.push(word) ;
					// console.log("  word " + wid) ;
					
				} ;
				chunk.content = words ;
				chunks.push(chunk) ;
			} ;
		} ;
		
		blob.transcript = {chunks: chunks} ;
		console.log("saving blob " + JSON.stringify(blob)) ;
		// nb - we NEVER save or send  the sessionId, deliveryObject, seq and history props - server manages this!
		
		// off to server !

		setSaveTranscriptButton(false) ;
		try {
			const response = await fetch("/correct/editedTranscript?interviewId=" + INTERVIEW_ID + "&sessionId=" + SESSION_ID, {
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
	
	async function loadTranscript(interviewId, sessionId) {	// may not be any..

    console.log("loadTranscript interview " + interviewId + " session " + sessionId) ;
		const resp = await fetch("/doc/transcriptJSON?interviewId=" + interviewId + 
													"&sessionId=" + sessionId + "&nonce=" +(new Date())) ;
		const ts = await resp.json() ;
		renderTranscript(ts) ;
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
		if (histories) for (let s=0;s<histories.length;s++) {
			const h = histories[s] ;
			historyContents =  "<P>" + h + "</P>" + historyContents ;
		}
		histEle.innerHTML = historyContents ;

		let s = "" ;
		if (ts.transcript.chunks.length == 1) ts.transcript.chunks = splitSingleChunk(ts.transcript.chunks[0]) ;

		const chunks = ts.transcript.chunks ;
		for (let c=0;c<chunks.length;c++) {
			const chunk = chunks[c] ;
			const spkNum = chunk.speaker ;
			//const startms = chunk.startms ;
      const startcs = chunk.content[0].s ;
			const spk = "spk" + spkNum ;		
			s += "<div id='c" + startcs + "' class='chunk'>" +
						"<div class='speaker " + spk + "'>" +
							"<div class='spkTime'>" +

								"<div class='ts'>" + formatTime(startcs) + "</div>" + 								
								
								"<div class='verified'><label class='switchSml'>" +
											"<input type='checkbox' class='verifiedSwitch' title='verified status' " +											
												((chunk.validated > 0) ? " checked='checked'" : "") +	
												">" +
											"<span class='sliderSml round'></span></label></div>" +									
		
								"<div class='spkName " + spk + "'>" + 
								lookupSpeaker(spk) +
					
								"</div>" +											
							"</div>" +									
							"<div class='words'>" ;	
									
			const words = chunk.content ;
			for (let w=0;w<words.length;w++) {
				const word = words[w] ;
				if (!(typeof word.t === 'string')) word.t = "" + word.t ;	// convert numbers to string - makes find/replace easier..
				wid++ ;
				let conf = word.c ;
				let freq = scaleWordFreq(freqList, word.t) ;
				let cclass = setConfidenceClass(conf, freq, word.t, wid) ;
				
				const ele = "<span id='w" + wid + "' class='w1 " +cclass + 
					"' contenteditable='true' " + 
					" title='confid " + conf + "/" + freq + " " + cclass + "'" +
					">" +
					word.t + "</span>&#8203;" ; // that's a zero-width space
				const wordObj = {id:wid, s: word.s, e:word, d: word.d} ;
				if (word.c) wordObj.c = word.c ;
				idToCword[wid] = wordObj ;
				wordsByTS.push(wordObj) ; // list of start cs for each word, ordered by ts
				s += ele ;
			}
			s += "</div></div></div>" ;			
		}
		tsEle.innerHTML = s ;
	}

	function setConfidenceClass(conf, freq, word, w) {

		if (conf === undefined) return "cc10" ;
		if (conf === null) return "cc10" ;
		if (!conf) conf = 1 ;	// 1.. 100
		if (!freq) freq = 1 ; // 1.. 100
		if (freq < 2) {
			conf = Math.round(conf * 0.66) ; // just a feeling to knock confidence
		}
		else if (freq >= 80) {
			if (conf < 20) conf = 20 ;
			else {
				conf = Math.round(conf * 1.2) ; // just a feeling to boost confidence
				if (conf > 100) conf = 100 ;
			}
		}
		if (conf >= 99) return "cc10" ;
		if ((conf > 85) && (freq > 40)) return "cc10" ;
		if ((conf > 85) && (freq > 20)) return "cc9" ;
		if ((conf < 20)) return "cc1" ;



		//let prod = Math.round(Math.log10(conf * 10 + freq * 0))  ; 
		let prod = Math.round((conf * 30 + freq * 20) / 400) ;
		// if (word == "Owens") 
		/*
		if ((w > 7060) && (w < 7085))
			console.log("XXXXXXXXXXXXXXXXXXXword " + w + ":" + word + " conf " + conf +
		 " freq " + freq + " prod " + prod + "  raw " + Math.log10(conf * 10 + freq * 0));
		 */
		if (prod > 10) prod = 10 ;
		if (prod < 1) prod = 1 ;
		return "cc" + prod ;
	}
	
	function loadAudio(interviewId, sessionId) {
	
    console.log("loadAudio " + interviewId + " sessionId " + sessionId) ;

		const audio = "<audio id='audioEle' controls autoplay playsinline=''" + 
			" style='width:100%'>" +
			"<source src='/listen/" + sessionId + "' type='audio/mpeg'>" +
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

	}
	
	var lastwordsByTSIndex = 0 ;
	var lastTime = 0 ;
	var lastMarkedCurrentWordId = null ;
	
	function timeUpdate() {

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

	function scaleWordFreq(freqList, word) {

		if (!word) return 0 ;
		let w = "" + word ; // safer..
	
		// strip punctuation and anything after it, including ' (coz freqlist is like that)
		let i = w.indexOf(".") ;
		if (i > 0) w = w.substring(0, i) ;
		i = w.indexOf(",") ;
		if (i > 0) w = w.substring(0, i) ;
		i = w.indexOf("!") ;
		if (i > 0) w = w.substring(0, i) ;
		i = w.indexOf("?") ;
		if (i > 0) w = w.substring(0, i) ;
		i = w.indexOf(":") ;
		if (i > 0) w = w.substring(0, i) ;
		i = w.indexOf(";") ;
		if (i > 0) w = w.substring(0, i) ;
		i = w.indexOf("'") ;
		if (i > 0) w = w.substring(0, i) ;  
		w = w.replaceAll('"', '').toLowerCase() ;  
		return freqList[w] || 0 ;
	}