
let CONSTANT_SPINNER = "<img src='static/images/24px-spinner-0645ad.gif' style='margin-top:6px;background:#ffffff;cursor: default;height:24px;width:24px'/>" ;

let Global_SEARCH_IN_PROGRESS = false ;
let Global_SEARCH_SEQ = 0 ;   // so we can ignore tardy responses from old searches
let Global_RESULTS = [] 

let syncingTextToAudio = true ;
let lastSyncedTranscriptDivId = null ;
let lastSyncedSess = -1 ;
let lastSyncedTime = -1 ;
let transcriptIndex = [] ;

window.addEventListener("load", (event) => {
  console.log("loaded") ;

  // testMultiDownload demo hack:
  let t =  document.getElementById("testMultiDownload") ;
  if (t) t.addEventListener("click", testMultiDownload) ;

  
  t =  document.getElementById("searchButton") ;
  if (t) t.addEventListener("click", searchClick) ;

  t = document.getElementById('stxt') ;
  if (t) t.addEventListener("keypress", function(event) {
    if (event.key === "Enter") {
      event.preventDefault();
      searchClick() ;
    }
  }) ;

  let trEles= document.getElementsByClassName("transcript") ;
  for (let te of trEles) {  // assumes in doc order!
    let id = te.id ;

    let i = id.indexOf("T", 3) ;
    let sess = id.substring(2, i) ;
    let sec = Number(id.substring(i+1)) ;
    console.log("tr " + id + " sess /" + sess + "/  sec/" + sec + "/") ;
    let sessList = transcriptIndex[sess] ;
    if (sessList == null) {
      sessList = [] ;
      transcriptIndex[sess] = sessList ;
      console.log("transcriptIndex sess created for /" + sess + "/") ;
    }
    sessList.push(sec) ;
  }

  let currentPlayingAudioElement = null ;

  let aes = document.getElementsByTagName("audio") ;
  for (ae of aes) {
    console.log("AUDIO ele " + ae.id) ;
    if (ae.id.startsWith("audioEle")) {

        ae.addEventListener("play", (event) => {
          let ele = event.target
          console.log(" play audio id" + ele.id) ;
          if (currentPlayingAudioElement != null) {
            if (currentPlayingAudioElement != ele) {
              console.log("stopping old audio " + currentPlayingAudioElement.id) ;
              currentPlayingAudioElement.pause() ;
              unfixAudioControl(currentPlayingAudioElement) ;
            }
          }
          fixAudioControl(ele) ;
          currentPlayingAudioElement = ele ;  
          document.getElementById(ele.id + "Caption").style.display = "block" ; // "inline-block" ;
          document.getElementById(ele.id + "Status").innerHTML = "<b>Seeking - please wait</b>" ;
          console.log("set new audio " + currentPlayingAudioElement.id)        
        }) ;

        ae.addEventListener("ended", (event) => {
          console.log(" ended play audio id " + event.target.id) ;
          if (currentPlayingAudioElement != null) {
            console.log("stopping old audio " + currentPlayingAudioElement.id) ;
            currentPlayingAudioElement.pause() ;
            unfixAudioControl(currentPlayingAudioElement) ;
            currentPlayingAudioElement = null ;
            if (lastSyncedTranscriptDivId) {
              document.getElementById(lastSyncedTranscriptDivId).style.borderLeftColor = "white" ; 
              lastSyncedTranscriptDivId = null ; 
            }
          }  
        }) ;

        ae.addEventListener("seeking", (event) => {
          console.log(" SEEKING audio id " + event.target.id) ;
          if (currentPlayingAudioElement != null) {
            document.getElementById(currentPlayingAudioElement.id + "Status").innerHTML = "<b>Seeking - please wait</b>" ;    
          }  
        }) ;

        ae.addEventListener("playing", (event) => {
          console.log(" PLAYING audio id " + event.target.id + ", time is " + event.target.currentTime) ;
          if (currentPlayingAudioElement != null) {
            document.getElementById(currentPlayingAudioElement.id + "Status").innerHTML = "" ;    
          }  
        }) ;

        ae.addEventListener("timeupdate", (event) => {
         // console.log(" timeupdate play audio id " + event.target.id + " time " + event.target.currentTime +
           //   " sync " + syncingTextToAudio) ;
          if (syncingTextToAudio) {
            let lookingForTime = event.target.currentTime ;
            let sessionSeq = Number(event.target.id.substring(8)) ;
            let sessList = transcriptIndex[sessionSeq] ;
            //console.log(" sessionSeq " + sessionSeq + " transcriptIndex= " + transcriptIndex[sessionSeq]) ;
            if (sessList != null) {
              let lastTs = null ;
              for (let ts of sessList) {
                if (ts > lookingForTime) {
                  if (lastTs == null) lastTs = ts ;
                  if ((lastSyncedSess == sessionSeq) && (lastSyncedTime == lastTs)) return ; // up to date
                  console.log(" TIME new transcript " + sessionSeq + " - " + lastTs) ;

                  lastSyncedSess = sessionSeq ;
                  lastSyncedTime = lastTs ;
                  let divId = "TS" + sessionSeq + "T" + lastTs ;
                  if (divId != lastSyncedTranscriptDivId) {
                    if (lastSyncedTranscriptDivId) 
                      document.getElementById(lastSyncedTranscriptDivId).style.borderLeftColor = "white" ; 
                    lastSyncedTranscriptDivId = divId ; 
                    makeVisible(divId, true) ;  // scroll to parent     
                    document.getElementById(divId).style.borderLeftColor = "green" ;   
                  }               
                  return ;
                }
                else lastTs = ts ;
              }
            }
          }   
        }) ;
    }
  }

  document.addEventListener('click', function (e) {
   
    console.log("got clik target classes:" + e.target.classList + " on id " + e.target.id + 
      " text " + (e.target.innerText + " NOTHING  ").substring(0,5)) ;

    if (e.target.classList.contains('showHide')) {
      let t = e.target ;
      let v = t.innerText ;
      // alert("click on " + v + " id " + t.id) ;

      if (t.id == "showAll") {
        for (let e1 of document.getElementsByClassName("showHide")) {
          let e1id = e1.id ;
          if (e1id == "showAll") continue ;
          if (e1id == "hideAll") continue ;
          e1.innerText = "Hide" ;
          document.getElementById(e1id.substring(1)).classList.remove('hide')  ;
          document.getElementById(e1id.substring(1)).classList.add('show') ; 
        }

        return ;
      }
      if (t.id == "hideAll") {
        for (let e1 of document.getElementsByClassName("showHide")) {
          let e1id = e1.id ;
          if (e1id == "showAll") continue ;
          if (e1id == "hideAll") continue ;
          e1.innerText = "Show" ;
          document.getElementById(e1id.substring(1)).classList.remove('show')  ;
          document.getElementById(e1id.substring(1)).classList.add('hide') ; 
        }        

        return ;
      }      
      
      if (v == "Show") {
        t.innerText = "Hide" ;
        console.log("Showing " + t.id.substring(1)) ;
        document.getElementById(t.id.substring(1)).classList.remove('hide')  ;
        document.getElementById(t.id.substring(1)).classList.add('show')  ;
      }
      else {
        t.innerText = "Show" ;
        console.log("Hiding " + t.id.substring(1)) ;
        document.getElementById(t.id.substring(1)).classList.remove('show')  ;
        document.getElementById(t.id.substring(1)).classList.add('hide') ; 
      }
    }
    else if (e.target.classList.contains('fclicktarget')) {
      let t = e.target ;
      let v = t.innerText ;
      let n = t.parentElement.parentElement.parentElement.parentElement.parentElement.children[0].innerText ;
      addFacet(n, v) ;
    }
    else if (e.target.classList.contains('correct')) {
      //alert("correct " + e.target.id.substring(4)) ;
      this.location.href = "/correct?id=" + e.target.id.substring(4) ;
    }
    else if (e.target.classList.contains('hilite')) {
      console.log("hilte") ;
      let t = e.target.href ;
      let i = t.indexOf('#') ;
      if (i >= 0) {
        let divId = t.substring(i+1) ;
        console.log("flashing " + divId) ;
        makeVisible(divId) ;        
        setTimeout(flash, 10, divId, true, 5) ;
      }     
    }
    else if (e.target.classList.contains('playAudio')) {
      console.log(" click on playAudio, data=" + e.target.getAttribute('data')) ;
      let t = e.target.getAttribute('data') ;
      if (t) {
        let sessionTime = t.split("-") ;  // session-time(centisecs)
        let audioEle = document.getElementById("audioEle" + sessionTime[0]) ;
        audioEle.pause() ;
        audioEle.currentTime = Number(sessionTime[1]) / 100 ;
        console.log("setting play at " + audioEle.currentTime) ;
        audioEle.play() ;
        console.log("started playing at " + audioEle.currentTime) ;
      }
    }
    else if (e.target.classList.contains('audioParaCheckbox')) {
      console.log(" click on audioParaCheckbox, checked=" + e.target.checked) ;
      syncingTextToAudio = e.target.checked ;
    }
    else if ((e.target.tagName == "IMG") &&  e.target.parentElement.classList.contains('playAudio')) {
      e.target.parentElement.click() ; // parent is playaudio..
    }


  }) ;



  t = window.location.href ; 
  //let i = t.indexOf('?') ;
  //t = ((i > 0) ? t.substring(0, i) : t) + '?stxt=' + encodeURIComponent(stxt) + '&keywordScaling=' + keywordScaling ;

  if (document.getElementById('stxt') && document.getElementById('stxt').value) searchClick() ; // initial search is ready (passed on url)

  t = window.location.href ;
  console.log("t=" + t) ;
  let i = t.indexOf("#") ;
  if (i > 0) {
    let blk = t.substring(i+1) ;
    console.log("blk is " + blk) ; //S<sessionnum>p<blk>
    i = blk.indexOf('p') ;
    if (i > 1) {
      let sessNo = blk.substring(1, i) ;
      let target = "L" + sessNo + "-" + blk.substring(i+1) ;
      console.log("target is " + target) ;      
 
      makeVisible(target) ;
      setTimeout(flash, 10, target, true, 5) ;
    }
    else if (blk.startsWith("L")) {
      makeVisible(blk) ;
      setTimeout(flash, 10, blk, true, 5) ;
    }
  }
 }) ;


 function makeVisible(divId, scrollToParent) {

  let target = document.getElementById(divId) ;
  console.log("makeVisible ele is " + target) ;

  let e = target ;
  while (true) {

    if (e.classList.contains('show')) ; // do nothing - already shown
    else if (e.classList.contains("hide")) {
      console.log("setting show on " + e.id) ;
      e.classList.remove("hide") ;
      e.classList.add("show") ;

     
    } 
    else if (e.classList.contains('showHide'))  e.innerText = "Hide" ;
    e = e.parentElement ;
    if (e == null) break ;
  } 

  if (scrollToParent) target.parentElement.scrollIntoView()
  else target.scrollIntoView() ; 
 }

 function  flash(divId, turnOn, countDown) {
    document.getElementById(divId).style.borderLeftColor = ((turnOn) ? "red" : "white") ;
    if (countDown > 0) setTimeout(flash, 500, divId, !turnOn, countDown - 1) ;
 }



async function searchClick() {

  if (Global_SEARCH_IN_PROGRESS) {
    console.log("Search already in progress - ignored") ;
    return ;
  }

  Global_SEARCH_IN_PROGRESS = true ;
  let thisSearchSeq = ++Global_SEARCH_SEQ ;

  document.getElementById("searchButton").innerHTML = CONSTANT_SPINNER ;
  
  document.getElementById("results").innerHTML = "<centre><H1>Search in progress - please wait</H1></centre" ;

  let stxt = document.getElementById('stxt').value ;
  let keywordScaling =  document.getElementById('keywordScaling').value ;
  let collection = document.getElementById('collection').value ;

  console.log("got search for " + stxt + "  / scale:" + keywordScaling + " collection:" + collection) ;

  // update url/history

  let t = window.location.href ; 
  let i = t.indexOf('?') ;
  t = ((i > 0) ? t.substring(0, i) : t) + 
                  '?stxt=' + encodeURIComponent(stxt) + '&keywordScaling=' + keywordScaling  +
                  '&collection=' + encodeURIComponent(collection) ;


  // console.log("OLD " + window.location.href + " NEW " + t + " " + ((window.location.href == t))) ;
  if (window.location.href != t) window.history.pushState('', '', t) ;

  let q = "?stxt=" + encodeURIComponent(stxt) +  "&keywordScaling=" + encodeURIComponent(keywordScaling) +
           "&collection=" + encodeURIComponent(collection) ;


  const response = await fetch("search/initSearch" + q);

  const readableStream = response.body ;
  const reader = readableStream.getReader() ;
  let text = "" ;
  while (true) {
      const { done, value } = await reader.read() ;
      if (done) console.log("got resp done:" + done) ; // + " value " + value) ;
      if (done) break;
     // console.log("thisSearchSeq=" + thisSearchSeq + " Global_SEARCH_SEQ=" + Global_SEARCH_SEQ) ;
      if (thisSearchSeq != Global_SEARCH_SEQ) {
        // we're receiving for an old search.  We're never going to show the contents, so ignore..
        console.log("Received response for an old search seq " + thisSearchSeq + " - now at " + Global_SEARCH_SEQ) ;
        continue ;
      }
      text += new TextDecoder("utf-8").decode(value) ;
      console.log("text received tot len " + text.length) ;
      if (text.endsWith("\n")) {
        processReceivedContent(text) ;
        text = "" ;       
      }
  }  
  if (text.length > 0) processReceivedContent(text) ;

}

function processReceivedContent(text) {

  console.log("in processReceivedContent") ;
  const objects = text.split("\n");
  let runningText = "" ;
  for (const obj of objects) {
    try {
        runningText += obj;
        let result = JSON.parse(runningText) ;
        process(result) ;
        //console.log("\n ********Received", result);
        runningText = "";
    } catch (e) {
      // Not a valid JSON object
    }
  }
}

function process(result) {

  console.log("in process") ;
  let resultsDiv = document.getElementById("results") ;
  console.log("result.ok=" + result.ok) ;
  if (!result.ok) {

    document.getElementById('status').innerHTML = "Error: " + JSON.stringify(result) ;
    return ;
  }
  if (!result.type) {
    resultsDiv.innerHTML = "Error no type in response: " + JSON.stringify(result) ;
    return ;
  }  
  console.log("result.type="+result.type) ;
  switch (result.type) {
    case 'resultOutline':     buildSearchResults(result.resultOutline) ; break ;
    case 'summary':           showSummary(result.summary) ; break ;
    //case 'resultListSummary': showResultListSummary(result.results) ; break ;
    default:                  resultsDiv.innerHTML = "Unknown type in result: " + result.type ;
  }
}

function buildSearchResults(results) {

  buildSkeleton() ;

  let t = "" ;

  document.getElementById("summary").innerHTML = "Showing top " +  results.length + " results" ;

  let resultList = [] ;
  Global_RESULTS = results ;

  console.log("buildSearchResults, xxresults length=" + results.length) ;
  for (let i=0;i<results.length;i++) {
    console.log("about to process result " + i + " of " + results.length) ;
    resultList.push(formatResultDoc(i, results[i])) ;  
  }

  console.log("got results resultList.length " + resultList.length) ;
  document.getElementById("resultList").innerHTML = "<OL>" + resultList.join(" ") + "</OL>" ;
   console.log("resultList.join()=" + resultList.join(" ")) ;
  if (Global_SEARCH_IN_PROGRESS) { // time to turn that off..
    Global_SEARCH_IN_PROGRESS = false ;
    document.getElementById("searchButton").innerHTML = "<span id='searchText' class='searchText'>Search</span>" ;
   }  
}



function formatResultDoc(seq, result) {

  console.log("formatResultDoc seq=" + seq + " docs " + result.docs.length) ;

  let target = "doc/outline?id=" +  encodeURI(result.interviewId) ;

  let r = "<LI><div class='rlist'>" +

      "<a href='"+ target + "'>" +  result.title +  "</a>" +
            ((result.year) ? (" " + result.year) : "") + " [" +  
      "<a href='https://nladom-test.nla.gov.au/" +  encodeURI(result.interviewId) +
        "' target='_blank'>" +  result.interviewId + "</a>] " +     

      " <div class='scores'>" + 
        // "max sim seq " + result.maxSimSeq + " maxNonSummaryLevel " + result.maxNonSummaryLevel + " " +
               "score raw: " +  result.score.toFixed(2) + ", semantic: " + result.similarityScore.toFixed(2) + "</div>" +
      "<div style='font-variant:small-caps'>Collection: " + result.collection + "</div>" +
     // "<div style='font-size:smaller'>Summary: " + result.summary.replaceAll("||", "") + "</div>" +
       "<div class='ssummary' style='font-size:smaller'>Summary: " + formatSummary(target, result) + "</div>" +
      " <br clear='all'/>" ;

  for (let doc of result.docs) {
    console.log("frd doc1") ;
  //  let blLevel = (doc.level == 0) ? result.maxNonSummaryLevel : doc.level ;
    r += "<table style='width:90%'>" +
          "<tr valign='top'>" +
            "<td style='width:70%'>" +
              "<div class='answer' id='sum" + seq + "'>" ;


    r += "<DIV class='scores'>score raw: " +  doc.score.toFixed(2) + ", semantic: " +
         doc.similarity.toFixed(2) + "</DIV>" ;
         console.log("frd doc1A") ;
    r += "<DIV>From Session " + (doc.sessionSeq + 1) + " " + 
   // formatStartEndCsWithLinkToCorrect(doc.interviewId, doc.startcs, doc.endcs) + "</DIV>" ;
    formatStartEndCsWithLinkToOutline(result.interviewId, doc.sessionSeq, doc.partId, doc.startcs, doc.endcs) + "</DIV>" ;
    if (doc.highlight) r += doc.highlight ;
    else if (doc.summary) r += "Summary: " + doc.summary ;
    else if (doc.content) r += doc.content ;
    console.log("frd doc2") ;
    r +=      "</div>" +
            "</td>" +
            "<td  style='width:20%'>" +
            /*
                "<a class='outlineLink' href='/doc/outline?id=" + 
                encodeURIComponent(result.interviewId) + 
                "#s" + doc.sessionSeq + "p" + (doc.partId) +  
                "' target='_blank'>transcript</a>" +
                */
            "</td>" +
          "</tr>" +
     
      "</table>" 
  }
  console.log("frd doc3") ;
  r += " <br clear='all'/>" +
      "</div></LI>" ;

    return r ;
}

function getSentences(text) {

  const segmenterDe = new Intl.Segmenter('en', { 
      granularity: 'sentence'
    });

  const sent = segmenterDe.segment(text.trim()) ;
 // console.log("\nsummary:" + text) ;

  let sentences = [] ;
  let si = 0 ;
  for (let s of sent) {
  // console.log("---->" + s.index + ": " + s.segment) ; 
    if (si == 0) {
      sentences.push(s.segment) ;
      si++ ;
    }
    else {
      let last = sentences[si-1] ;
      if ((last.length >= 3) && (last.charAt(last.length) != '\n')) {
        last = last.trim() ;
      // console.log(" last.charAt(last.length - 3)=" + last.charAt(last.length - 3)) ;
        if ((last.charAt(last.length - 3) == ' ') || last.endsWith("Dr.") || last.endsWith("Mr.") || 
            last.endsWith("Mrs.")) {
        // console.log("joined") ;
          sentences[si-1] += s.segment ;
          continue ;
        }
      }
      sentences.push(s.segment) ;
      si++ ;
      //console.log("added " + sentences.length) ;
    }
  }
  return sentences ;
}

function formatSummary(targetBase, summaryHolder) {

  if (!summaryHolder.summary) return "No summary." ;

  //console.log("indexToLowerContent="+summaryHolder.indexToLowerContent) ;

  let index = (summaryHolder.indexToLowerContent) ? summaryHolder.indexToLowerContent.split(" ") : null ;

  if (!index) return summaryHolder.summary;

  let sentences = getSentences(summaryHolder.summary) ;
  let realSC = 0 ;
  for (let s of sentences)
    if (s.trim().length > 0) realSC++ ;

  let t = "" ; // + sentences.length + "/" + realSC + " sentences, " + index.length + " indices, indexToLowerContent=" + summaryHolder.indexToLowerContent + " " ;
   

  let sc = 0 ;
  for (let s of sentences) {
    if (s.trim().length <= 0) {
      if (sc > 0)  t += s.replaceAll("\n", "<BR/>") ;
    }
    else {
      t += "<a href='" + targetBase + "#L" + index[sc].replace("/", "-") + "' class='hilite'>" + 
            s.replaceAll("\n", "<BR/>") + "</a>&nbsp";
      sc++ ;
    }
  }
  return t ;

  // return summaryHolder.summary.trim().replaceAll("\n", "<BR/>") ;
}

function showSimilarities(simList) {

  for (let i=0;i<simList.length;i++) document.getElementById("sem" + i).textContent = simList[i].toFixed(3) ;
}

function  buildSkeleton() {

  let resultsDiv = document.getElementById("results") ;
  let r = "<div id='summary' style='margin-top:1em;margin-bottom:1em'></div>" +
          "<div id='status' class='status'></div>" +
          "<table>" +
            "<tr>" +

              "<td width='90%'><div id='resultList'>Result list</div></td>" +

            "</tr>" +
          "</table>" ;
    resultsDiv.innerHTML = r ;
}

function formatDate(yyyyHmmHdd) {

  return yyyyHmmHdd.substring(8) + yyyyHmmHdd.substring(4, 8) + yyyyHmmHdd.substring(0, 4) ;
}

function formatCs(cs) {

  if ((cs === undefined || cs === null) || (typeof cs !== 'number')) return "" ;
  let secs = Math.floor(cs / 100) ;
  let mins = Math.floor(secs / 60) ;
  let hrs = Math.floor(mins / 60) ;
  secs = secs - mins * 60 ;
  mins = mins - hrs * 60 ;
  return hrs.toString().padStart(2,0) + ":" + mins.toString().padStart(2,0) + ":" +
         secs.toString().padStart(2,0) ;
}

function formatStartEndCs(startcs, endcs) {
  
  return formatCs(startcs)  + " - " + formatCs(endcs) ;    
}

function formatStartEndCsWithLinkToCorrect(docId, startcs, endcs) {

  return "<a class='timeRangeNoPad' href='/correct?id=" + docId.replaceAll("-", "_") + "_" +
          Math.floor(startcs / 100) + "' target='_blank'>" +             
          formatStartEndCs(startcs, endcs) + 
          " <img src='/static/images/play.png' border=0 height=16/></a>" ;

          /*  link to old delivery system
            return "<a class='timeRangeNoPad' href='https://nladom-test.nla.gov.au/" + docId + "/listen/0-" + 
          Math.floor(startcs / 100) + "' target='_blank'>" +             
          formatStartEndCs(startcs, endcs) + 
          " <img src='/static/images/play.png' border=0 height=16/></a>" ;
          */
}

function formatStartEndCsWithLinkToOutline(interviewId, sessionSeq, partId, startcs, endcs) {

    return "<a class='outlineLink' href='/doc/outline?id=" + 
                encodeURIComponent(interviewId) + 
                "#s" + sessionSeq + "p" + (partId) + 
                "' target='_blank'>" +
              formatStartEndCs(startcs, endcs) + 
              " <img src='/static/images/play.png' border=0 height=16/>" +
            "</a>" ;

}

function fixAudioControl(ac) {

  let pe = ac.parentElement ;
  pe.style.removeProperty("float") ;
  //pe.style.top = "10px" ;
  pe.style.bottom = "0%" ;
  pe.style.right = "10px" ;
  pe.style.position = "fixed" ;
  pe.style.border = "1px solid gray" ;
  pe.style.padding = "4px" ;
  ac.style.width = "40em" ;


  console.log("fix audioId=" + ac.id) ;
  document.getElementById(ac.id + "Para").style.display = "inline" ; // "block" ;
  document.getElementById(ac.id + "Checkbox").checked = (syncingTextToAudio) ? true : false ;


}

function unfixAudioControl(ac) {

  ac.style.width = "20em" ;
  let pe = ac.parentElement ;
  pe.style.removeProperty("position") ;
  pe.style.removeProperty("top") ;
  pe.style.removeProperty("right") ;
  pe.style.removeProperty("border") ;
  pe.style.removeProperty("padding") ;
  pe.style.float = "left" ;
  document.getElementById(ac.id + "Caption").style.display = "none" ;
  document.getElementById(ac.id + "Para").style.display = "none" ;
}


function testMultiDownload() {

  let filesToDownload = [
    '/static/transcripts/nla.obj-208322780-tc.xml',
    '/static/transcripts/nla.obj-218188489-tc.xml',
    '/static/transcripts/nla.obj-218189396-tc.xml',
    '/static/transcripts/nla.obj-218198610-tc.xml'
  ]

  // kick off downloads..

  setTimeout(downloadOneFile, 10, filesToDownload) ;  
}

function downloadOneFile(filesToDownload) {

  var file = filesToDownload.pop();

  var a = document.createElement("a") ;
  a.style.display = 'none' ;
  a.setAttribute('href', file) ;
  a.setAttribute('download', file.substring(file.lastIndexOf('/') + 1)) ;
  a.click() ;

  // browser gets indigestion if too much too soon - let it settle for a sec..

  console.log("Downloaded " + file + " - " + filesToDownload.length + " to go..")
  if (filesToDownload.length > 0) setTimeout(downloadOneFile, 1000, filesToDownload) ; 

}

