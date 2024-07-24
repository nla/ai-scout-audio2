const fs = require('fs') ;
const log = require('log4js').getLogger('util') ;
const axios = require('axios') ;
const util = require('../util/utils') ;
const solr = require('../util/solr') ;

let appConfig = null ;
let interviewCache = [] ;
let cacheLen = 0 ;

/*
interview: {
  interviewId:
  title:
  subtitle:
  interviewee:
  interviewer:
  sponsor:
  yyyymmdd:
  year:
  collection:
  loadedDate:
  loadedBy:
  comment:
  summary:
  sessions: [
    sessionId:
    sessionSeq:
    deliveryObject:
    yyyymmdd:
    year:
    summary:
    transcript:
    parts: [   // interview and session summary parts are not stored here but are stored in solr audio2SessionPart
      partId:  // S or Snn or Snn-nn  or Snn-nn-nn etc  for session summaries or Tnn{-nn}* for transcript or I for interview level summary
      startcs:
      endcs:
      content:
      parts: [] // sub-parts, ordered by partId
    ]
  ]
}
*/

function convertToParas(txt) {

  if (!txt) return txt ;
  if (txt.length < 100) return txt ;

  let firstNL = txt.indexOf("\n", 4) ;
  let lastNL = txt.lastIndexOf("\n", txt.length - 4) ;

  if ((firstNL > 1) && (lastNL > firstNL)) return convertToParasWithNewLines(txt) ;
  else return convertToParasWithNoNewLines(txt) ;
}

function convertToParasWithNewLines(txt) {   

  if (!txt) return txt ;
  let addedPara = false ;
  let start = 0 ;
  let sentCount = 0 ;
  let n = "" ;
  while (start < txt.length) {
    let i = txt.indexOf("\n", start) ;  
    if (i < 0) {
      n += txt.substring(start) ;
      break ;
    }
    i = i + 1 ; // next start
    n += txt.substring(start, i) ;
    if (++sentCount >= 0) {
      sentCount = 0 ;
      if (addedPara) n += "</P>" ;
      n += "<P>" ;
      addedPara = true ;
    }
    start = i ;    
  }
  if (addedPara) n += "</P>" ;
  return n ;
}

function convertToParasWithNoNewLines(txt) {  // after every third sentence, add a para

  if (!txt) return txt ;
  let addedPara = false ;
  let start = 0 ;
  let sentCount = 0 ;
  let n = "" ;
  while (start < txt.length) {
    let i = txt.indexOf(". ", start) ; // ok acronym and name fail , Mr. E.G. Whitlam...
    if (i < 0) {
      n += txt.substring(start) ;
      break ;
    }
    i = i + 2 ; // next start
    n += txt.substring(start, i) ;
    if (++sentCount >= 4) {
      sentCount = 0 ;
      if (addedPara) n += "</P>" ;
      n += "<P>" ;
      addedPara = true ;
    }
    start = i ;    
  }
  if (addedPara) n += "</P>" ;
  return n ;
}

async function addToCache(iv) {

  iv.summary = (iv.summary) ? convertToParas(iv.summary) : null ;
  await getSessionsAndParts(iv) ;
  console.log("getSessionsAndParts done for " + iv.interviewId) ;
  if (cacheLen > 200) {
    interviewCache = [] ;
    cacheLen = 0 ;
  }
  interviewCache[iv.interviewId] = iv ;
  cacheLen++ ;
}

function clearCache(interviewId) {  

  if (interviewId) {
    if (interviewCache[interviewId]) {
      console.log("deleting from cache:" + interviewId) ;
      delete interviewCache[interviewId]
      cacheLen-- ;
    }
  }
  else {
    interviewCache = [] ;
    cacheLen = 0 ;
    console.log("deleting from cache: ALL") ;
  }
}


function getPartParent(partId) {

    let t = partId.lastIndexOf("-") ;
    if (t < 0) return  ""  ;
    if (partId.charAt(0) == "S") return partId.substring(0, t) ;
    else return "S" + partId.substring(1, t) ;
}

async function getSessionsAndParts(iv) {

  // get sessions

  iv.sessions = [] ;
 
  let selectData = 
  "wt=json&rows=9999" +
  "&q=interviewId:\"" + encodeURIComponent(iv.interviewId) + "\"" +
  "&fl=sessionId,sessionSeq,deliveryObject,transcriptJson,yyyymmdd,year,comment,summary" +
  "&sort=sessionSeq asc" ;

  let solrRes = null ;

  //console.log("about to get " + appConfig.solr.getSolrBaseUrl() + "audio2Session/select?" + selectData) ;
  try {
    solrRes = await axios.get(
      appConfig.solr.getSolrBaseUrl() + "audio2Session/select?" + selectData) ;
  }
  catch (e) {
    console.log("Error solr getSessionsAndParts sessions " + e) ;
    if( e.response) console.log(e.response.data) ; 
    throw e ;
  }

  if ((solrRes.status != 200) || !(solrRes.data && solrRes.data.response && solrRes.data.response.docs))
    throw "SOLR getSessionsAndParts sessions unexpected response: " + solrRes.status + " or nothing found" ;

  let sessions = solrRes.data.response.docs ;

  let sessionIndex = [] ;
  let sessionPartIndex = [] ;
  for (let session of sessions) {
    sessionIndex[session.sessionId] = iv.sessions.length ;
    iv.sessions.push(session) ;
    sessionPartIndex[session.sessionId] = [] ; // will index parts for the session here
    session.parts = [] ;
  }

  console.log("getSessionsAndParts iv:" + iv.interviewId + " session count:" + iv.sessions.length) ;


  // get parts
  selectData = 
  "wt=json&rows=9999" +
  "&q=interviewId:\"" + encodeURIComponent(iv.interviewId) + "\"" +
  "&fl=sessionId,sessionSeq,partType,partId,startcs,endcs,content,sessionTranscript,embedding,indexToLowerContent" +
  "&sort=sessionSeq asc, partId asc" ;  // was sessionId asc, partId asc

  solrRes = null ;

  console.log("about to get " + appConfig.solr.getSolrBaseUrl() + "audio2SessionPart/select?" + selectData) ;
  try {
    solrRes = await axios.get(
      appConfig.solr.getSolrBaseUrl() + "audio2SessionPart/select?" + selectData) ;
  }
  catch (e) {
    console.log("Error solr getSessionsAndParts parts " + e) ;
    if( e.response) console.log(e.response.data) ; 
    throw e ;
  }

  if ((solrRes.status != 200) || !(solrRes.data && solrRes.data.response && solrRes.data.response.docs))
    throw "SOLR getSessionsAndParts sessions unexpected response: " + solrRes.status + " or nothing found" ;

  for (let part of solrRes.data.response.docs) {
    if (part.partType == 'I') {    // interview summary
      iv.summary = part.content ;
      iv.indexToLowerContent = part.indexToLowerContent ;
      continue ;
    }
    let owningSession = iv.sessions[sessionIndex[part.sessionId]] ;
    if (part.partId == 'S') {   // session summary
      owningSession.summary = part.content ;  // also gets added as a part...
      owningSession.indexToLowerContent = part.indexToLowerContent ;
    }

    part.parts = [] ;    
    let parent = getPartParent(part.partId) ;
  //  console.log("READ part " + part.partId + " parent " + parent + " part.sessionId " + part.sessionId) ;
    if (parent.length == 0) owningSession.parts.push(part) ;
    else sessionPartIndex[part.sessionId][parent].parts.push(part) ;
    sessionPartIndex[part.sessionId][part.partId] = part ;

  } 
}


async function getSingleSessionAndParts(sessionId, getParts) {

  // get session
 
  let selectData = 
  "wt=json&rows=9999" +
  "&q=sessionId:\"" + encodeURIComponent(sessionId) + "\"" +
  "&fl=sessionId,interviewId,sessionSeq,deliveryObject,transcriptJson,yyyymmdd,year,comment," +
  "title,subtitle,interviewee,interviewer,sponsor,collection,loadedDate,loadedBy,summary,transcript" ;

  let solrRes = null ;

  //console.log("about to get " + appConfig.solr.getSolrBaseUrl() + "audio2Session/select?" + selectData) ;
  try {
    solrRes = await axios.get(
      appConfig.solr.getSolrBaseUrl() + "audio2Session/select?" + selectData) ;
  }
  catch (e) {
    console.log("Error solr getSessionsAndParts sessions " + e) ;
    if( e.response) console.log(e.response.data) ; 
    throw e ;
  }

  if ((solrRes.status != 200) || !(solrRes.data && solrRes.data.response && solrRes.data.response.docs))
    throw "SOLR getSingleSessionAndParts id " + sessionId + " unexpected response: " + solrRes.status + " or nothing found" ;

  let session = solrRes.data.response.docs[0] ;

  if (getParts) {
    session.parts = [] ;

    let singleSessionPartIndex = [] ;

    // get parts
    selectData = 
    "wt=json&rows=9999" +
    "&q=sessionId:\"" + encodeURIComponent(sessionId) + "\"" +
    "&fl=sessionId,sessionSeq,partId,startcs,endcs,content,sessionTranscript" +
    "&sort=sessionId asc, partId asc" ;

    solrRes = null ;

    //console.log("about to get " + appConfig.solr.getSolrBaseUrl() + "audio2SessionPart/select?" + selectData) ;
    try {
      solrRes = await axios.get(
        appConfig.solr.getSolrBaseUrl() + "audio2SessionPart/select?" + selectData) ;
    }
    catch (e) {
      console.log("Error solr getSingleSessionAndParts parts " + e) ;
      if( e.response) console.log(e.response.data) ; 
      throw e ;
    }

    if ((solrRes.status != 200) || !(solrRes.data && solrRes.data.response && solrRes.data.response.docs))
      throw "SOLR getSessionsAndParts sessions unexpected response: " + solrRes.status + " or nothing found" ;

    for (let part of solrRes.data.response.docs) {
      if (part.partId == 'S') {   // session summary
        session.summary = part.content ;
        break ;
      }
      part.parts = [] ;

      let parent = getPartParent(part.partId) ;
      if (parent.length == 0) session.parts.push(part) ;
      else singleSessionPartIndex[parent].parts.push(part) ;
      singleSessionPartIndex[part.partId] = part ;
    } 
  }
  return session ;
}

const MIN_CHUNK_SIZE = 50 ;
const MAX_CHUNK_SIZE = 250 ;
const OK_CHUNK_SIZE = 200 ;


async function processTextIntoChunks(origChunks) {

  // was text, now array of orig tei chunks with s (startcentisecs) and t (text) and duration d

  // Basic plan is to create new chunks of between 200 and 250 words.  We try to have a chunk ending with a .

  let chunks = [] ;

  let startcs = -1 ;
  let endcs = -1 ;
  let wordCount = 0 ;
  let words = "" ;

  for (let oc of origChunks) {

   // if (!oc.t) {
    //  console.log(" empty t chunk " + JSON.stringify(oc)) ;
    //}
    if (words.length > 0) {
      words += " " + oc.t ;
    }
    else {
      startcs = oc.s ;
      words = "" + oc.t ; // might be a number..
    }
    wordCount++
    endcs = oc.s + oc.d ;

    // oc.t may be a number..

    if ((wordCount >= MAX_CHUNK_SIZE) || ((wordCount >= OK_CHUNK_SIZE) && ("" + oc.t).endsWith('.'))) {
      chunks.push({text: words, words: wordCount, startcs: startcs, endcs: endcs}) ;
      startcs = -1 ;
      endcs = -1 ;
      wordCount = 0 ;
      words = "" ;
    }
  }
  if (wordCount > 0) 
  chunks.push({text: words, words: wordCount, startcs: startcs, endcs: endcs}) ;

  for (let chunk of chunks)     
    chunk.embedding = setEmbeddingsAsFloats(await util.getEmbedding(chunk.text)) ; 

  return chunks ;
}

async function processChunksIntoSummaries(chunksHierarchy, maxChunksToCombine, minChunksToCombine, bottomLevel, session) {

  // Find semantic similarity between chunks of text so we can group the most similar for summaries.
  // The first time we are invoked, chunksHierarchy only contains the original text grouped into sentences or paras.
  // We are then invoked recursively until there is only one output chunk, the entire document.

  let chunks = chunksHierarchy[chunksHierarchy.length - 1] ;
  if (chunks.length <= 1) return chunksHierarchy ; // all done!

  console.log("\n\n * * * * * processChunksIntoSummaries HIERARCHY LENGTH " + chunksHierarchy.length + 
                          " chunks.length " + chunks.length + ":\n\n") ;


  console.log("neighbours") ;

  for (let i=0;i<chunks.length;i++) {
    let t = " Chunk " + i + " " ;
    if (i < 1) t += "------" ;
    else t += Number(util.innerProduct(chunks[i].embedding, chunks[i-1].embedding)).toFixed(4) ;

    if (i >= (chunks.length -1)) t += " -----" ;
    else t += " " + Number(util.innerProduct(chunks[i].embedding, chunks[i+1].embedding)).toFixed(4) ;
    console.log(t) ;
  }

/*
  let simRows = [] ;
  for (let i=0;i<chunks.length;i++) {
    let simCols = [] ;
    for (let j=0;j<=i;j++) {
      simCols.push(util.innerProduct(chunks[i].embedding, chunks[j].embedding)) ;
    }
    simRows.push(simCols) ;
  }
  console.log("\nmatrix") ;
  for (let i=0;i<simRows.length;i++) {
    let row = "" ;
    let simCols = simRows[i] ;
    for (let j=0;j<=i;j++) row += " " + Number(simCols[j]).toFixed(3) ;
    console.log(row) ;
  }
*/

  let sumChunks = [] ;
  let currentSummary = {text: chunks[0].summary ? chunks[0].summary : chunks[0].text, 
                        words:chunks[0].words,
                        startChunk: 0,
                        startcs: chunks[0].startcs,
                        endcs: chunks[0].endcs
                      } ;
  let runLength = 1 ;
  
  for (let i=1;i<chunks.length;i++) {
    if ((runLength >= maxChunksToCombine) || 
        (((chunks.length > 4) && (runLength >= minChunksToCombine)) && 
            (util.innerProduct(chunks[i].embedding, chunks[i-1].embedding) < 0.65))) {
      currentSummary.endChunk = i - 1 ;
      sumChunks.push(currentSummary) ;
      console.log("created summary " + currentSummary.startChunk + " - " + currentSummary.endChunk + 
              "\n" + currentSummary.text) ;

      currentSummary = { text: chunks[i].summary ? chunks[i].summary : chunks[i].text,
                         words:chunks[i].words,
                         startcs: chunks[i].startcs,
                         endcs: chunks[i].endcs,
                         startChunk:i} ;
      runLength = 1 ;
      startChunk = i ;
    }
    else {
      currentSummary.text += " " + (chunks[i].summary ? chunks[i].summary : chunks[i].text) ;
      currentSummary.words += chunks[i].words ;
      currentSummary.endcs = chunks[i].endcs ;
      runLength++ ;
    }
  }
  currentSummary.endChunk = chunks.length - 1 ;
  sumChunks.push(currentSummary) ;
  console.log("created final summary " + currentSummary.startChunk + " - " + currentSummary.endChunk) ;

  console.log("========= reduced to " + sumChunks.length + " summaries ") ;
let x = 0 ;
  for (let sumChunk of sumChunks) {

    let s = await getSummary(sumChunk, bottomLevel, session, x) ;
    console.log("Getting summary for sumCHunk seq " + x++ + " of " + sumChunks.length) ;
    sumChunk.summary = s ;
    sumChunk.words = s.split(/\s+/).length ;
    sumChunk.embedding = setEmbeddingsAsFloats(await util.getEmbedding(sumChunk.summary)) ;
    console.log(" TEXT IN: " + sumChunk.text + "\n SUMMARY: " + sumChunk.summary) ;
  }

  // recurse summaries to get a single 500 word summary.  Never combine more than 4 at a time..
  
  chunksHierarchy.push(sumChunks) ;
  return processChunksIntoSummaries(chunksHierarchy, 4, 2, false, session) ; // go recursive - combine a max of 4 summaries, min of 2 summaries
}


async function getSummary(chunk, bottomLevel, session, seq) { 

  let targetSummaryLength = 300 ;
  if (chunk.words < targetSummaryLength) targetSummaryLength = chunk.words ;

  let promptInstructions = null ;
  if (bottomLevel) promptInstructions =  "Summarise the provided transcript of an interview " + // audio recording " +
    ((seq < 9999) ? ("with the title: \"" + session.title + "\" ") : "") +  // was seq == 0
    "in less than " + targetSummaryLength + " words. " +
    "Base the summary only on the provided transcript text.  Never provide a preamble or a postscript - " +
    "just summarise the transcript without further commentary, producing a shorter version of the " +
    "provided text." ;
  else promptInstructions =  "Further summarise the provided summary of an interview " + // audio recording transcript " +
    ((seq < 9999) ? ("with the title: \"" + session.title + "\" ") : "") +  // was seq == 0
    "in less than " + targetSummaryLength + " words. " +
    "Base the summary only on the provided text.  Never provide a preamble or a postscript - " +
    "just summarise the content without further commentary, producing a shorter version of the " +
     "provided text." ;

  console.log("\ngetSummary bottomLevel " + bottomLevel + " seq " + seq + " instructions: " + promptInstructions) ;

  try {
    let prompt = "<|im_start|>system\n" +
        promptInstructions +
        "<|im_end|>\n" +
        "<|im_start|>user\n<text> " +
        chunk.text +
        "</text> <|im_end|>\n" +
        "<|im_start|>assistant\n" ;
    let startResponseMarker = "<|im_start|>assistant" ;              

   // console.log("\n=================Summary prompt: " + prompt) ;

    let data = {
          "prompt": prompt,
          "use_beam_search": false,              
          "temperature":0.0,
          "n":1,
          "max_tokens": Math.ceil(targetSummaryLength * 2 * 1.2),
          "stream":false,
          skip_special_tokens: false,                         // skip and stop are attempts to stop startling model from seeming to loop
          stop: ["<|im_end|>"]                                  // open-hermes-neural-chat blend emits this
    } ;

    let eRes = await axios.post(appConfig.summaryURL, 
      data,
      { headers: {'Content-Type': 'application/json'}
      }  
    ) ;
    //console.log("back from get sum") ;
    if (!eRes.status == 200) throw "Cant get summary, server returned http resp " + eRes.status ;

   if (!eRes.data || !eRes.data.text) throw "Cant get summary, server returned no data" ;
   let r = eRes.data.text[0] ;
   if (startResponseMarker) {
     let rs = r.indexOf(startResponseMarker) ;
     if (rs >= 0) r = r.substring(rs + startResponseMarker.length) ;
   }
   let ri = r.indexOf("[ANSWER STARTS]") ;
   if (ri >= 0) r = r.substring(ri+15).trim() ;
       
   r = r.replaceAll("</s>", "").replaceAll("" + targetSummaryLength + "-word summary:", "").replaceAll("[ANSWER ENDS]", "") ;

   r = r.replace(/\bThe user\b/g, "The speaker").replace(/\bthe user\b/g, "the speaker")  // one model is doing this..
        .replace(/<\/|im_end|>/g, "") ; 

   let i = r.indexOf("<") ; // phi-3 small sometimes emits < and extra stuff... just chuck it away
   if (i > 32) r = r.substring(0, i) ;

   //console.log("\n========== ======= ==== Returned summary: " + r) ;
   return r ;
  }
  catch (e) {
    console.log("Error in getSummary: " +e) ;
    return null ;
  }
}


function setEmbeddingsAsFloats(rawEmbedding) { // fixes a problem where embedding has to much precision and blows up SOLR
 
  for (let k=0;k<768;k++)rawEmbedding[k] = Number(rawEmbedding[k]).toFixed(8) ;
  return rawEmbedding ;
}

async function createAudioSummaries(session) {

  let ajstr = "" ;
  for (let jp of session.transcriptJson) ajstr += jp ;
  let ajs = JSON.parse(ajstr) ; // original json

  let origChunks = [] ;
  if (ajs.transcript.chunks.length > 0) {          
    for (let chunk of ajs.transcript.chunks) 
      for (let c of chunk.content)  origChunks.push(c) ;
  }

  let chunks = await processTextIntoChunks(origChunks) ; // contents) ;
  for (let i=0;i<chunks.length;i++) 
    console.log("\n==>CHUNK " + i + " - " + " time " + chunks[i].startcs + "-" + chunks[i].endcs +
      chunks[i].words + " words: " + chunks[i].text) ;
  
  // chunk hierarchy - first element is the bottom-most, top is the single doc summary

  chunksHierarchy = [] ;  // will be an array of chunkSummary arrays
  chunksHierarchy.push(chunks) ;
  await processChunksIntoSummaries(chunksHierarchy, 5, 1, true, session) ; // combine max of 5, min of 1 to get a summary

  if (chunksHierarchy.length == 1) {  // all the text fitted into the summary!
    let txt = chunksHierarchy[0][0].text ;
    //console.log("sole text chunk:" + txt) ;
    chunksHierarchy.push([{  // create a dummy summary
      summary: txt,
      startChunk: 0,
      endChunk: 0,
      startcs: chunksHierarchy[0][0].startcs,
      endcs: chunksHierarchy[0][0].endcs,
      words: chunksHierarchy[0][0].words,
      embedding: await util.getEmbedding(txt)
    }]) ;
  }
  
  console.log("\n - - - - chunk hierarchy summary:") ;
  for (let i=0;i<chunksHierarchy.length;i++) {
      let level = chunksHierarchy[i] ;        
      console.log("\n===> Level " + i + " summary count: " + level.length) ;
      for (let j=0;j<level.length;j++) {
        let summary = level[j] ;
        console.log("\n Level " + i + " Summary " + j + " source from " + summary.startChunk +
          " to " + summary.endChunk + "  Words: " + summary.words +
          " time " + summary.startcs + "-" + summary.endcs) ;
        if (i == 0) console.log("SOURCE TEXT:\n" + summary.text) ;
        else console.log("SUMMARY TEXT:\n" + summary.summary) ;
      }
  }

  // reverse the hierarchy for storage..  high summary -> transcript text (historical reasons...)

  let topLevel = chunksHierarchy.length - 1 ;
  let topChunk = chunksHierarchy[topLevel][0] ;
  buildTopDownChunkHierarchy(topChunk, topLevel, chunksHierarchy) ;

  console.log("REVERSED hierarchy") ;

  assignChunkIds(topChunk, 0, "", 0) ;

  session.summary = topChunk.summary ;
  if (!topChunk.embedding) topChunk.embedding = setEmbeddingsAsFloats(await util.getEmbedding(topChunk.summary)) ;

  session.embedding = setEmbeddingsAsFloats(topChunk.embedding) ;

  console.log("SESSION SUMMARY: " + session.summary) ;

  // extract transcript as text for storing in summary transcript

  let contents = null ;
  // optimise speakers for lookup
  let speakerLookup = [] ;
  for (let sp of ajs.speakers) speakerLookup["sp" + sp.id] = sp.name ;

  for (let chunk of ajs.transcript.chunks) {
    if (contents == null) contents = "" ;
    else contents += "\n\n" ;
    contents += speakerLookup["sp" + chunk.speaker] + ":" ;
    for (let c of chunk.content) 
      contents += " " + c.t ;            
  }

  session.transcript = contents ;
  // update the session with the transcript text and summary


  let selectData = 
  "wt=json&rows=1" +
  "&q=sessionId:\"" + encodeURIComponent(session.sessionId) + "\"" +
  "&fl=*" ;

  let solrRes = null ;

  try {
    solrRes = await axios.get(
      appConfig.solr.getSolrBaseUrl() + "audio2Session/select?" + selectData) ;
  }
  catch (e) {
    console.log("Error solr getSessions sessions " + e) ;
    if( e.response) console.log(e.response.data) ; 
    throw e ;
  }

  if ((solrRes.status != 200) || !(solrRes.data && solrRes.data.response && solrRes.data.response.docs))
    throw "SOLR getSingleSessionAndParts id " + sessionId + " unexpected response: " + solrRes.status + " or nothing found" ;

  let existingSession = solrRes.data.response.docs[0] ;
  
  existingSession.transcript = contents ; // note this is just text, NOT transcriptJson
  existingSession.transcriptStemmed = contents ; // note this is just text, NOT transcriptJson
  existingSession.summary = session.summary ;
  existingSession.summaryStemmed = session.summary ;
  existingSession.embedding = session.embedding ;

  delete existingSession["_version_"] ;  // update/replace wont work with this!

  console.log("about to update session with contents id:" + session.sessionId) ;
  await solr.addOrReplaceDocuments(existingSession, "audio2Session") ;  // unique key is sessionid
  console.log("session update done") ;


  // now store the parts - first, delete any...

  console.log("deleting parts") ;
  await solr.deleteByQuery("sessionId:\"" + encodeURIComponent(session.sessionId) + "\"", "audio2SessionPart") ;

  console.log("parts deleted") ;

  let partDocs = [] ;
  console.log("About to add parts to SOLR") ;

  await addChunksToPartsAsSOLRdocs(partDocs, session, topChunk) ;

  await solr.addOrReplaceDocuments(partDocs, "audio2SessionPart") ;
  console.log("Added " + partDocs.length + " parts") ;
  clearCache(session.interviewId) ;
}  


async function addChunksToPartsAsSOLRdocs(partDocs, session, chunk) {

 // console.log("\n**** addChunksToPartsAsSOLRdocs, chunk:" + JSON.stringify(chunk)) ;

  let partDoc = {
    interviewId: session.interviewId,
    sessionId: session.sessionId,
    sessionSeq: session.sessionSeq,
    partType: chunk.id.substring(0, 1),
    partId: chunk.id,
    startcs: chunk.startcs,
    endcs: chunk.endcs,
    title: session.title,
    collection: session.collection,
    interviewee: session.interviewee,
    interviewer: session.interviewer,
    year: session.year,
    content: chunk.summary || chunk.text,
    contentStemmed: chunk.summary || chunk.text
  }

  // for overall session part, add transcript - useful for keyword searches on entire session
  if (chunk.id == "S") {
    partDoc.sessionTranscript = session.transcript ;
    partDoc.sessionTranscriptStemmed = session.transcript ;
  }

  if (!chunk.embedding) {
    console.log("No chunk emedding " + chunk.id) ;
    chunk.embedding = setEmbeddingsAsFloats(await util.getEmbedding(partDoc.content)) ;
    partDoc.embedding = chunk.embedding ;
  }
  else {
    //console.log("Yes chunk embedding " + chunk.id) ;
    //console.log("chunk emb: " + JSON.stringify(chunk.embedding)) ;
    partDoc.embedding = setEmbeddingsAsFloats(chunk.embedding) ;
  }
  //console.log("part id")
  partDocs.push(partDoc) ;

  if (chunk.children) {
    for (let child of chunk.children)
      addChunksToPartsAsSOLRdocs(partDocs, session, child) ;
  }
}



function assignChunkIds(chunk, level, prevLevels, childnum) {

  let displayLevel = (level == 0) ? "" : (((prevLevels.length > 0) ? (prevLevels + "-") : "") + 
      ((childnum < 10) ? ("0" + childnum) : childnum)) ;
  chunk.id = ((chunk.children) ? "S" : "T") + displayLevel ;

  let indent = "                                             ".substring(0, level * 3) ;
  console.log(indent + chunk.id + " \tlevel " + level + " source from " + chunk.startChunk +
  " to " + chunk.endChunk + "  Words: " + chunk.words +
  " time " + chunk.startcs + "-" + chunk.endcs) ;
  if (chunk.children) {
    let childSeq = 0 ;
    for (let child of chunk.children)
      assignChunkIds(child, level + 1, displayLevel, childSeq++) ;
  }
}


function buildTopDownChunkHierarchy(topChunk, topLevel, chunksHierarchy) {

  let nextLowestLevel = topLevel - 1 ;
  topChunk.children = [] ;
  for (let i=topChunk.startChunk;i<=topChunk.endChunk;i++) {
    let child = chunksHierarchy[nextLowestLevel][i] ;
    topChunk.children.push(child) ;
    if (nextLowestLevel > 0) buildTopDownChunkHierarchy(child, nextLowestLevel, chunksHierarchy) ;
  }
}
/*
async function storeMainAudioDoc(ajs, existingDoc, chunksHierarchy, contents) { // ajs = audio javascript

  audioId = ajs.id ;

  if (!ajs.summary) {

    if (existingDoc && existingDoc.summary) {
      console.log("summary created from existing doc summary " + existingDoc.summary) ;
      ajs.summary = existingDoc.summary ;    
      ajs.embedding = null ;
    }
  }

  if (ajs.summary) {
      console.log(" CREATING doc summary embedding from " + ajs.summary) ;
      ajs.embedding = setEmbeddingsAsFloats(await util.getEmbedding(existingDoc.summary)) ;
   }
   else {
    console.log("No summary, no embedding created") ;
    ajs.embedding = null ;
  }

  if (ajs.embedding)  // fixes a problem where embedding has to much precision and blows up SOLR
      for (let k=0;k<768;k++) ajs.embedding[k] = Number(ajs.embedding[k]).toFixed(6) ;

  let title = "Unknown" ;
  let collection = "Other" ;
  if (ajs.metadata.title) {
    for (let t of ajs.metadata.title) {
      if ("main" == t.type) title = t.value ;
      else collection = util.assignPossibleCollection(t.value, collection) ;
    }
  }
  let interviewer = "Unknown" ;
  let interviewee = (ajs.metadata.author) ? ajs.metadata.author[0] : "Unknown" ;
  if (ajs.metadata.responsibility) {
    for (let t of ajs.metadata.responsibility) {
      if ("Interviewee" == t.type) interviewee = t.name ;
      else if ("Interviewer" == t.type) interviewer = t.name ;
    }
  }
  let deliveryObject =  ajs.metadata.source || "Unknown" ;
  let yyyymmdd = Number(ajs.metadata.date) || "Unknown" ;
  let year = (ajs.metadata.date) ? Number(ajs.metadata.date.substring(0, 4)) : 0 ;

  console.log("\n\nid " + ajs.id + " title " + title + " collection " + collection +
    " interviewee " + interviewee + " interviewer " + interviewer +
    " yyyymmdd " + yyyymmdd + " year " + year + " deliveryObject " + deliveryObject) ;

  if (existingDoc) {
    console.log("about to delete doc: " + ajs.id) ;
    await solr.deleteId(ajs.id, "audio") ;
  }

  // add to solr

  // split json transcript into 20K fields

  let trjs = JSON.stringify(ajs) ;
  let trjss = [] ;
  while (trjs.length > 0) {
    if (trjs.length < 20000) {
      trjss.push(trjs) ;
      break ;
    }
    trjss.push(trjs.substring(0, 20000)) ;
    trjs = trjs.substring(20000) ;
  }
  
  let mainDoc = [{
    id: ajs.id,
    title: title,
    //comment: comment,
    collection: collection,
    loadedBy: 'kfitch',
    loadedDate: new Date(),
    summary: (existingDoc) ? existingDoc.summary : "",
    summaryStemmed: (existingDoc) ? existingDoc.summary : "",
    transcript: contents,
    transcriptStemmed: contents,
    transcriptJson: trjss,
    interviewee: interviewee,
    interviewer: interviewer,
    deliveryObject: deliveryObject,
    yyyymmdd: yyyymmdd,
    year: year,
    maxNonSummaryLevel: (chunksHierarchy) ? chunksHierarchy.length - 2 : 0,
  }] ;
  if (ajs.embedding) {
    mainDoc[0].embedding = ajs.embedding ;
    console.log("MAIN DOC EMBEDDING assigned to ajs embedding len " + ajs.embedding.length) ;
  }
  else console.log("No mainDoc embedding stored ---------------------") ;
  await solr.addOrReplaceDocuments(mainDoc, "audio") ;

  clearCache() ;

  return mainDoc[0] ;
}
*/

async function createInterviewSummaryFromSessionSummaries(iv) {

  try {

    if (!iv) throw new Error("no interview found: " + interviewId) ;
  
   console.log("createInterviewSummaryFromSessionSummaries iv= " + iv.interviewId +
      ", session count=" + iv.sessions.length) ;

    let sessionSummaries = "" ;

    let sc = iv.sessions.length ;
    if (sc < 1) {
      console.log("ERROR - no sessions to summarise for " + iv.interviewId) ;
      return ;
    }

    const MAX_CONTEXT_BYTES = 10000 ; // running an 8K token context
    let maxSizePerSession = Math.floor(MAX_CONTEXT_BYTES / sc) - 20 ;

    let ss = 1 ;
    for (let session of iv.sessions) {
      if (sessionSummaries) sessionSummaries += "\n" ;
      let t = session.summary ;
      if (!t) continue ; // ??
      if (t.length > maxSizePerSession) {
        let i = t.lastIndexOf(". ", maxSizePerSession) ; // try to end on a sentence
        if (i < 0) i = maxSizePerSession ;
        let j = t.lastIndexOf(".\n", maxSizePerSession) ; // try to end on a para
        if (j < 0) j = maxSizePerSession ;
        if (j > (maxSizePerSession * 0.8)) i = j ;        // if it is reasonable
        t = t.substring(0, i) + "... " ;
      }
      sessionSummaries += "Session " + ss++ + " summary: " +t ;
    }
    /*
    if (sessionSummaries.length > 4500) {
      console.log("truncated session summaries ") ;
      sessionSummaries = sessionSummaries.substring(0, 4500) ;        
    }
      */

  
    let promptInstructions = "Summaries of various individual sessions of an audio recording " +
      "with the title: \"" + iv.title + "\" will be provided by the user.  Please produce a consolidated summary " +
      "of less than 300 words. Never provide a preamble or a postscript - " +
      "just summarise the content without further commentary, producing a shorter version of the " +
      "provided text." ;


    let prompt = "<|im_start|>system\n" +
        promptInstructions +
        "<|im_end|>\n" +
        "<|im_start|>user\n<text> " +
        "Session summaries. " +
        sessionSummaries +
        "</text> <|im_end|>\n" +
        "<|im_start|>assistant\n" ;
    let startResponseMarker = "<|im_start|>assistant" ;              

    // console.log("\n=================Summary prompt: " + prompt) ;

    let data = {
          "prompt": prompt,
          "use_beam_search": false,              
          "temperature":0.0,
          "n":1,
          "max_tokens": Math.ceil(300 * 2 * 1.2),
          "stream":false,
          skip_special_tokens: false,                         // skip and stop are attempts to stop startling model from seeming to loop
          stop: ["<|im_end|>"]                                  // open-hermes-neural-chat blend emits this
    } ;

    let eRes = await axios.post(appConfig.summaryURL, 
      data,
      { headers: {'Content-Type': 'application/json'}
      }  
    ) ;
    //console.log("back from get sum") ;
    if (!eRes.status == 200) throw "Cant get interview summary, server returned http resp " + eRes.status ;
  
     if (!eRes.data || !eRes.data.text) throw "Cant get interview summary, server returned no data" ;
     let r = eRes.data.text[0] ;
     if (startResponseMarker) {
       let rs = r.indexOf(startResponseMarker) ;
       if (rs >= 0) r = r.substring(rs + startResponseMarker.length) ;
     }
     let ri = r.indexOf("[ANSWER STARTS]") ;
     if (ri >= 0) r = r.substring(ri+15).trim() ;
         
     r = r.replaceAll("</s>", "").replaceAll("[ANSWER ENDS]", "") ;
  
     r = r.replace(/\bThe user\b/g, "The speaker").replace(/\bthe user\b/g, "the speaker")  // one model is doing this..
          .replace(/<\/|im_end|>/g, "") ; 
  
     let i = r.indexOf("<") ; // phi-3 small sometimes emits < and extra stuff... just chuck it away
     if (i > 32) r = r.substring(0, i) ;
  
     console.log("\n========== ======= ==== Returned interview summary: " + r) ;



     // update the interview with the summary

     let existingInterview = await getInterviewSOLR(iv.interviewId) ;
     existingInterview.summary = r ;
     existingInterview.summaryStemmed = r ;
     existingInterview.embedding = setEmbeddingsAsFloats(await util.getEmbedding(r)) ;
     await updateInterviewSOLR(existingInterview) ;

     iv.summary = r ;
     iv.summaryStemmed = r ;
     iv.embedding = existingInterview.embedding  ;

    // now store the special part - first, delete any...

    console.log("deleting IV part") ;
    await solr.deleteByQuery("interviewId:" + encodeURIComponent(iv.interviewId) +
      " AND partType:\"I\"", "audio2SessionPart") ;

    console.log("IV part deleted") ;

    let partDocs = [] ;
    console.log("About to add parts to SOLR") ;

    let partDoc = {
      interviewId: iv.interviewId,
      sessionId: "-",
      partType: "I",
      partId: "I",
      title: iv.title,
      collection: iv.collection,
      interviewee: iv.interviewee,
      interviewer: iv.interviewer,
      year: iv.year,
      content: r,
      contentStemmed: r,
      embedding: existingInterview.embedding
    }
    partDocs.push(partDoc) ;

    await solr.addOrReplaceDocuments(partDocs, "audio2SessionPart") ;
    console.log("Added INTERVIEW " + partDocs.length + " parts") ;
    clearCache(iv.interviewId) ;
    return iv ;

  }
  catch (e) {
    console.log("failed to create interview summary for " + iv.interviewId) ;
    console.log("Error: " + e)
    console.log(e.stack) ;
    // ignored, really.. request to create will be deleted
  }
  
}

async function getInterviewSOLR(interviewId) {

  let selectData = 
  "wt=json&rows=1" +
  "&q=interviewId:\"" + encodeURIComponent(interviewId) + "\"" +
  "&fl=*" ;

  let solrRes = null ;

  try {
    solrRes = await axios.get(
      appConfig.solr.getSolrBaseUrl() + "audio2Interview/select?" + selectData) ;
  }
  catch (e) {
    console.log("Error solr getS Interview " + e) ;
    if( e.response) console.log(e.response.data) ; 
    throw e ;
  }

  if ((solrRes.status != 200) || !(solrRes.data && solrRes.data.response && solrRes.data.response.docs))
    throw "SOLR get Interview id " + iv.interviewId + " unexpected response: " + solrRes.status + " or nothing found" ;

  return solrRes.data.response.docs[0] ;
 }

 async function updateInterviewSOLR(existingInterview) {

  delete existingInterview["_version_"] ;  // update/replace wont work with this!

  console.log("about to update interview with summary id:" + existingInterview.interviewId) ;
  await solr.addOrReplaceDocuments(existingInterview, "audio2Interview") ;  // unique key is interviewId
  console.log("interview update done") ;
 }

 async function updateSessionPartSOLR(interviewId, sessionId, partId, propsToAdd) {

  // read it
  let query = "interviewId:\"" + util.jsonEscape(interviewId) + 
  "\" AND sessionId:\"" +  util.jsonEscape(sessionId) + 
  "\" AND partId:\"" + util.jsonEscape(partId) + "\"" ;

  let selectData = "wt=json&rows=1&q=" + query + "&fl=*" ;

  console.log("updateSessionPartSOLR query is " + query) ;
  let solrRes = null ;
  try {
    solrRes = await axios.get(
      appConfig.solr.getSolrBaseUrl() + "audio2SessionPart/select?" + selectData) ;
  }
  catch (e) {
    console.log("Error solrupdateSessionPartSOLR read " + e) ;
    if( e.response) console.log(e.response.data) ; 
    throw e ;
  }

  if ((solrRes.status != 200) || !(solrRes.data && solrRes.data.response && solrRes.data.response.docs))
    throw "SOLR get Interview id " + iv.interviewId + " unexpected response: " + solrRes.status + " or nothing found" ;

  let existingPart = solrRes.data.response.docs[0] ;

  delete existingPart["_version_"] ;  // update/replace wont work with this!
  for (prop in propsToAdd) {
    if (propsToAdd[prop]) existingPart[prop] = propsToAdd[prop] ;
    else delete existingPart[prop] ;
  }

  console.log("about to delete audio2SessionPart with id:" + interviewId + " /  " + sessionId + "/" + partId) ;

  try {
    await solr.deleteByQuery(query, "audio2SessionPart") ;
  }
  catch (e) {
    console.log("failed to delete audio2SessionPart using query ") + query ;
    throw e ;
  }

  await solr.addOrReplaceDocuments(existingPart, "audio2SessionPart") ;  // unique key is interviewId
  console.log("interview update done") ;
 }


 function addRecursiveParts(sessionSeq, parts,  testEmbeddings, targetIds, debugContent) {

  for (let part of parts) {
    console.log(" GOT PART " + part.partId) ;
    if (part.partId == 'I') continue ;
    testEmbeddings.push(part.embedding) ;
    targetIds.push(sessionSeq + part.partId) ;
    debugContent.push(part.content) ;
    if (part.parts)   addRecursiveParts(sessionSeq, part.parts, testEmbeddings, targetIds, debugContent) ;    
    
  }
}

function getSentences(segmenterDe, text) {

  const sent = segmenterDe.segment(text.trim()) ;
  console.log("\nsummary:" + text) ;

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

async function matchSummaryAndDetailSentences(sentences, matchingSessionPrefix, testEmbeddings, targetIds, debugContent) {

  console.log("*matchSummaryAndDetailSentences  matchingSessionPrefix="+matchingSessionPrefix) ;

  console.log("sentences: " + sentences.length) ;
  let indexToLowerContent = "" ;
  for (let ss of sentences) {

    let t = ss.trim() ;
    if (t.length < 1) continue ; // ignored..
    let ourEmbedding = await util.getEmbedding(t) ;

    let bestMatchScore = -9999 ;
    let bestMatchIndex = -1 ;
    for (let i=0;i<targetIds.length;i++) {
      if (matchingSessionPrefix && !targetIds[i].startsWith(matchingSessionPrefix)) continue ;
      let score = Math.abs(util.innerProduct(testEmbeddings[i], ourEmbedding)) ;
      if (score > bestMatchScore) {
        bestMatchScore = score ;
        bestMatchIndex = i ;
      }
    }

    if (bestMatchIndex < 0) return null ; // indexToLowerContent += " X" ;
    else {
      indexToLowerContent += " " + targetIds[bestMatchIndex] ;
      console.log("BEST match for " + t + "\nWAS score " + bestMatchScore + " part " + targetIds[bestMatchIndex] +
            ": " + debugContent[bestMatchIndex]) ;
    }
  }
  return indexToLowerContent.trim() ;
}

module.exports = {

	init: async function(appConfigParm) {

		appConfig = appConfigParm ;
    console.log("util/doc initialised ") ;   
    log.info("util/doc initialised ") ;     
	},

  resetinterviewCache: async function (replacementInterviews) {  // just replaces the doc cache

    interviewCache = [] ;
    for (let interview of replacementInterviews) {
      await addToCache(interview) ;
    }
  },
  
  getInterview: async function(id) {
  
    console.log("getInterview id=" + id) ;

    let iv = interviewCache[id] ;
    if (iv) return iv ;
  
    let selectData = 
      "wt=json&rows=1" +
      "&q=interviewId:\"" + encodeURIComponent(id) + "\"" +
      "&fl=interviewId,title,subtitle,collection,interviewee,interviewer,sponsor,yyyymmdd," +
          "loadedBy,loadedDate,summary,comment,embedding" ;

    let solrRes = null ;
  
    try {
      console.log("getInterview " + appConfig.solr.getSolrBaseUrl() + "audio2Interview/select?" + selectData) ;
      solrRes = await axios.get(
        appConfig.solr.getSolrBaseUrl() + "audio2Interview/select?" + selectData) ;  
    }
    catch (e) {
      console.log("Error solr getInterview " + e) ;
      if( e.response) console.log(e.response.data) ; 
      throw e ;
    }
  
    console.log("getInterview status: " + solrRes.status) ;
    if ((solrRes.status != 200) || !(solrRes.data && solrRes.data.response && solrRes.data.response.docs))
      throw "SOLR getInterview unexpected response: " + solrRes.status + " or nothing found" ;
  
    iv = solrRes.data.response.docs[0] ;

    console.log("GOT IV " + iv) ;
    if (!iv) throw new Error("interview does not exist: " + id) ;
    await addToCache(iv) ;
    return iv ;
  },

  getMostSimilar: async function(interview) {

    if (!interview) return ;
    if (interview.mostSimilar) return ;

    if (!interview.embedding) return ;
    console.log("gms embedding=" + interview.embedding.length) ;

    let selectData = 
      "wt=json&rows=6" +
      "&q={!knn f=embedding topK=50}" + JSON.stringify(interview.embedding) + 
      "&fl=interviewId,title,year,yyyymmdd,score" ;

    let solrRes = null ;

    try {

      solrRes = await axios.post(
        appConfig.solr.getSolrBaseUrl() + "audio2Interview/select",
        selectData) ;        
    }
    catch (e) {
      console.log("Error solr getMostSimilar " + e) ;
      if( e.response) console.log(e.response.data) ; 
      console.log(e.stack) ;
      throw e ;
    }

    if ((solrRes.status != 200) || !(solrRes.data && solrRes.data.response && solrRes.data.response.docs))
      throw "SOLR getMostSimilar unexpected response: " + solrRes.status + " or nothing found" ;

    let mostSimilar = [] ;
    for (let i=0;i<solrRes.data.response.docs.length;i++) {
      let sdoc = solrRes.data.response.docs[i] ;

      if (interview.interviewId == sdoc.interviewId) continue ; // yes, we are self-similar!
      mostSimilar.push(sdoc) ;
    }
    interview.mostSimilar = mostSimilar ;
  },


  // initiated on startup, then runs to completion (empties queue) then sleeps 30sec

  findAudioToSummarise: async function() {

    let selectData = 
      "wt=json&rows=1" +
      "&q=*:*" +
      "&sort=id ASC" +
      "&fl=id,timestamp,docid,transcriptJson" ;
    let solrRes = null ;
  
    let cutoffTime = Math.floor(new Date().getTime() / 1000) ;
    try {
     // console.log("findAudioToSummarise " + appConfig.solr.getSolrBaseUrl() + "audio/audioReindexQueue?" + selectData) ;
      solrRes = await axios.get(
        appConfig.solr.getSolrBaseUrl() + "audioReindexQueue/select?" + selectData) ;
    }
    catch (e) {
      console.log("Error solr audioReindexQueue " + e) ;
      if( e.response) console.log(e.response.data) ; 
      throw e ;
    }
  
   // console.log("audioReindexQueue status: " + solrRes.status) ;
    if ((solrRes.status != 200) || !(solrRes.data && solrRes.data.response))
      throw "SOLR list uploads unexpected response: " + solrRes.status ;
  
    if (solrRes.data.response.numFound == 0) {
      console.log("Nothing in reindex queue") ;
      return false ;
    }
    let reindexRequest = solrRes.data.response.docs[0] ;
    console.log("Got audio to summarise from reindex queue: " + 
        JSON.stringify(reindexRequest).substring(0, 300) + "...") ;

    if (cutoffTime < reindexRequest.timestamp) {
      console.log("Unusually, cutoffTime " + cutoffTime + " less than first reindex queue time " + reindexRequest.timestamp) ;
      cutoffTime = reindexRequest.timestamp ;
    }

    // summarise!

    try {
      // our summarise request is either for a session or for an interview
      if (reindexRequest.docid.indexOf("**INTERVIEW**") == 0) { // summarise an interview from summaries
          let interviewId = reindexRequest.docid.substring(13) ;
          // cutoffTime = reindexRequest.timestamp ; // we cant delete future requests, as summaries may be being generated?  NOT SURE
          let ivWithSummary = await createInterviewSummaryFromSessionSummaries(await this.getInterview(interviewId)) ;
          await this.buildIndexToLowerContent(ivWithSummary) ;
      }
      else {  // summarise a session
      
        let session = await getSingleSessionAndParts(reindexRequest.docid, false) ; 
        // reindex req docid is ALWAYS a session id (for now)   We dont need the parts because we will generate them!

        console.log("findAudioToSummarise got session " + session) ;
        session.transcriptJson = reindexRequest.transcriptJson ; // may have been overwritten of multiple updates processed during update time

        await createAudioSummaries(session) ;

        // now delete all records for the docid (sessionId) we just indexed up to and including cutoff time
      }
    }
    catch (err) {
      console.log("summarise failed: " + reindexRequest.docid + "  Err:" + err) ;
      console.log(err.stack) ;
      cutoffTime = reindexRequest.timestamp ; // just delete this one..
    }

    let deleteQuery = "docid:\"" + util.jsonEscape(reindexRequest.docid) + "\" AND timestamp:[-999999999 TO " + cutoffTime + "]" ;

    try {
      await solr.deleteByQuery(deleteQuery, "audioReindexQueue") ;
    }
    catch (err) {
      console.log("findAudioToSummarise  deleteByQuery failed, query: " + deleteQuery + " err:" + err) ;
      throw err ;
    }
    return true ;
  },

  storeMainAudioDocAndQueueSummarisation: async function(ajs, existingDoc, chunksHierarchy, contents) { // ajs = audio javascript

    // store main document using the ajs

    let mainDoc = storeMainAudioDoc(ajs, existingDoc, chunksHierarchy, contents) ;

    // enqueue creation of chunks/summaries/.. (which WILL update the main doc)

      // split json transcript into 20K fields

    let trjs = JSON.stringify(ajs) ;
    let trjss = [] ;
    while (trjs.length > 0) {
      if (trjs.length < 20000) {
        trjss.push(trjs) ;
        break ;
      }
      trjss.push(trjs.substring(0, 20000)) ;
      trjs = trjs.substring(20000) ;
    }

    let now = new Date().getTime() ;
    let enqueueDoc = [{
      id: "" + now,
      timestamp: Math.floor(now / 1000),  // secs - we store as an int in SOLR
      docid: ajs.id,
      transcriptJson: trjss
    }] ;
    await solr.addOrReplaceDocuments(enqueueDoc, "audioReindexQueue") ;
    return mainDoc ;
  },


  storeInterviewFromTEI: async function(ajs, alreadyExists) {   // from TEI js, create an interview SOLR rec
  
    let title = "Unknown" ;
    let subTitle = null ;
    let collection = "Other" ;
    if (ajs.metadata.title) {
      for (let t of ajs.metadata.title) {
        if ("main" == t.type) title = t.value ;
        else {
          collection = util.assignPossibleCollection(t.value, collection) ;
          if (!subTitle) subTitle = t.value ;
          else {
            if (!Array.isArray(subTitle)) subTitle = [ subTitle] ;
            subTitle.push(t.value) ;
          }
        }

      }
    }
    let interviewer = "Unknown" ;
    let interviewee = (ajs.metadata.author) ? ajs.metadata.author[0] : "Unknown" ;
    if (ajs.metadata.responsibility) {
      for (let t of ajs.metadata.responsibility) {
        if ("Interviewee" == t.type) interviewee = t.name ;
        else if ("Interviewer" == t.type) interviewer = t.name ;
      }
    }

    let sponsor = ajs.metadata.sponsor ;

    let yyyymmdd = Number(ajs.metadata.date) || "Unknown" ;
    let year = (ajs.metadata.date) ? Number(ajs.metadata.date.substring(0, 4)) : 0 ;
  
    console.log("\n\nid " + ajs.interviewId + " title " + title + " collection " + collection +
      " interviewee " + interviewee + " interviewer " + interviewer +
      " yyyymmdd " + yyyymmdd + " year " + year ) ;
  
    if (alreadyExists) {
      console.log("about to delete doc: " + ajs.interviewId) ;
      await solr.deleteId(ajs.interviewId, "audio2Interview") ;
    }
  
    // add to solr  
   
    let interviewDoc = {
      interviewId: ajs.interviewId,
      title: title,
      subtitle: subTitle,
      collection: collection,
      loadedBy: 'kfitch',
      loadedDate: new Date(),
      interviewee: interviewee,
      interviewer: interviewer,
      sponsor: sponsor,
      yyyymmdd: yyyymmdd,
      year: year
    } ;

    await solr.addOrReplaceDocuments(interviewDoc, "audio2Interview") ;
    return interviewDoc ;
  },

  storeSessionAndQueueSummarisation:  async function(interviewDoc, session, contents) {   // from TEI js, create a session SOLR rec

    console.log("IN storeSessionAndQueueSummarisation  interviewDoc:" + JSON.stringify(interviewDoc).substring(0, 1000) + "..." ) ;
    
    // add to solr  
   
    let sessionDoc = {
      sessionId: session.sessionId,
      interviewId: interviewDoc.interviewId,
      sessionSeq: session.seq,
      deliveryObject: session.deliveryObject,
      title: interviewDoc.title,
      subtitle: interviewDoc.subtitle,
      collection: interviewDoc.collection,
      loadedBy: 'kfitch',
      loadedDate: new Date(),
      interviewee: interviewDoc.interviewee,
      interviewer: interviewDoc.interviewer,
      sponsor: interviewDoc.sponsor,
      yyyymmdd: interviewDoc.yyyymmdd,
      year: interviewDoc.year,
      transcript: contents,
      transcriptStemmed: contents,
      summary: null // needs to be calculated in the background
    } ;

    console.log("session.yyyymmdd:" + session.yyyymmdd + " interviewDoc.yyyymmdd:" + interviewDoc.yyyymmdd );
    // maybe override date with session specific date
    if (session.yyyymmdd) 
      sessionDoc.yyyymmdd = session.yyyymmdd ;

    if (sessionDoc.yyyymmdd) sessionDoc.year = Number(("" + sessionDoc.yyyymmdd).substring(0, 4)) ;
    
    // split session json ("transcript") into 20K fields

    let trjs = JSON.stringify(session) ;
    let trjss = [] ;
    while (trjs.length > 0) {
      if (trjs.length < 20000) {
        trjss.push(trjs) ;
        break ;
      }
      trjss.push(trjs.substring(0, 20000)) ;
      trjs = trjs.substring(20000) ;
    }

    sessionDoc.transcriptJson = trjss ;
  
    // solr unique key is sessionId, so an update will replace
    await solr.addOrReplaceDocuments(sessionDoc, "audio2Session") ;

    // now enqueue session to be summarised


    let now = new Date().getTime() ;
    let enqueueDoc = [{
      id: "" + now,
      timestamp: Math.floor(now / 1000),  // secs - we store as an int in SOLR
      docid: session.sessionId,
      transcriptJson: trjss
    }] ;
    await solr.addOrReplaceDocuments(enqueueDoc, "audioReindexQueue") ;

    return sessionDoc ;
  },


  queueInterviewSummaryGeneration: async function(interviewDoc) {

    // first delete any existing requests to reindex the interview, because there's now some
    // session that has updated the interview and that session must be regenerated first..

    await solr.deleteByQuery('docid:"**INTERVIEW**' + interviewDoc.interviewId + '"', "audioReindexQueue") ;

    let now = new Date().getTime() ;
    let enqueueDoc = [{
      id: "" + now,
      timestamp: Math.floor(now / 1000),  // secs - we store as an int in SOLR
      docid: "**INTERVIEW**" + interviewDoc.interviewId,
      transcriptJson: "{}"
    }] ;
    await solr.addOrReplaceDocuments(enqueueDoc, "audioReindexQueue") ;

  },



  
  // parm iv must contain parts (sessions) and transcripts and their embeddings

  buildIndexToLowerContent: async function (iv) {


    // iv.sessions contains the sessions, which in turn contain parts
    // iv.summary contains the iv summary

    // split the iv.summary into sentences

    console.log("\nXXXXXXXXXX\nbuildIndexToLowerContent for iv " + iv.interviewId) ;

    if (!iv.summary) console.log("warning - no iv summary for " + iv.interviewId) ;
    else {

      const segmenterDe = new Intl.Segmenter('en', { 
        granularity: 'sentence'
      });
      let sentences = getSentences(segmenterDe, iv.summary) ;

      console.log("sentencesI:" + sentences.length) ;
      for (let ss of sentences) console.log("-->" + ss) ;
      //for (let s of sent) console.log("-->" + s.index + ": " + s.segment) ;  
      
      let testEmbeddings = [] ;
      let targetIds = [] ;
      let debugContent = [] ;

      console.log("getting sessions ") ;
      for (let session of iv.sessions) {
        let sessionSeq = "" + session.sessionSeq + "/";
        console.log(" got session " + session.sessionSeq + " - " + session.sessionId + " parts:" + session.parts) ;
        addRecursiveParts(sessionSeq, session.parts, testEmbeddings, targetIds, debugContent) ;
      }


      iv.indexToLowerContent = await matchSummaryAndDetailSentences(sentences, null, testEmbeddings, targetIds, debugContent) ;
      
      console.log("====INTERVIEW indexToLowerContent: " + iv.indexToLowerContent + "\n") ;

      if (iv.indexToLowerContent)
        await updateSessionPartSOLR(iv.interviewId, "-", "I", {indexToLowerContent: iv.indexToLowerContent}) ;
      

      // now repeat for sessions if more than 1

      if (iv.sessions && (iv.sessions.length > 1)) {

        // each session summary sentence is processed.  It cam ONLY match against parts in that session.

        for (let session of iv.sessions) {
          let sessionSeq = "" + session.sessionSeq + "/" ;
          console.log("\n =====>got session " + session.sessionSeq + " - " + session.sessionId + " parts:" + session.parts) ;
          
          if (!session.summary) continue ;
          let sentences = getSentences(segmenterDe, session.summary) ;

          console.log("sentencesS:" + sentences.length) ;
          for (let ss of sentences) console.log("SSSS-->" + ss) ;


          session.indexToLowerContent = await matchSummaryAndDetailSentences(sentences, sessionSeq, testEmbeddings, targetIds, debugContent) ;
      
          console.log("====SESSION indexToLowerContent: " + session.indexToLowerContent + "\n") ;

          if (session.indexToLowerContent)
            await updateSessionPartSOLR(iv.interviewId, session.sessionId, "S", {indexToLowerContent: session.indexToLowerContent}) ;
        }
      }
    }
  },


  getBasicInterview: async function(interviewId) {

    let selectData = 
    "wt=json&rows=1" +
    "&q=interviewId:\"" + encodeURIComponent(interviewId) + "\"" +
    "&fl=interviewId,title,collection,interviewee,interviewer,sponsor,yyyymmdd,year,summary" ;
  
    let solrRes = null ;
  
    try {
      solrRes = await axios.get(
        appConfig.solr.getSolrBaseUrl() + "audio2Interview/select?" + selectData) ;
    }
    catch (e) {
      console.log("Error solr getBasicInterview " + e) ;
      if( e.response) console.log(e.response.data) ; 
      throw e ;
    }
  
    if ((solrRes.status != 200) || !(solrRes.data && solrRes.data.response && solrRes.data.response.docs))
      throw "SOLR getBasicInterview id " + iv.interviewId + " unexpected response: " + solrRes.status + " or nothing found" ;
  
    return solrRes.data.response.docs[0] ; 
  },

  getIndexToLowerContentForInterview: async function(id) {
  
    console.log("getindexToLowerContentForInterview id=" + id) ;

    let iv = interviewCache[id] ;
    if (iv && iv.indexToLowerContent) {
      console.log("..from cache") ;
      return iv.indexToLowerContent ;
    }

    let selectData = 
      "wt=json&rows=1" +
      "&q=interviewId:\"" + encodeURIComponent(id) + "\" AND partId:I" ;
      "&fl=indexToLowerContent" ;

    let solrRes = null ;  
    try {
      console.log("getIndexToLowerContentForInterview " + appConfig.solr.getSolrBaseUrl() + "audio2SessionPart/select?" + selectData) ;
      solrRes = await axios.get(
        appConfig.solr.getSolrBaseUrl() + "audio2SessionPart/select?" + selectData) ;  
    }
    catch (e) {
      console.log("Error solr getIndexToLowerContentForInterview " + e) ;
      if( e.response) console.log(e.response.data) ; 
      throw e ;
    }
  
    console.log("getIndexToLowerContentForInterview status: " + solrRes.status) ;
    if ((solrRes.status != 200) || !(solrRes.data && solrRes.data.response && solrRes.data.response.docs))
      throw "SOLR getIndexToLowerContentForInterview unexpected response: " + solrRes.status + " or nothing found" ;
  
    let doc = solrRes.data.response.docs[0] ;

    if (!doc) throw new Error("getIndexToLowerContentForInterview interview does not exist: " + id) ;
    if (iv) iv.indexToLowerContent = doc.indexToLowerContent ; // add it to the cache?!

    return doc.indexToLowerContent ;
  }

} ;