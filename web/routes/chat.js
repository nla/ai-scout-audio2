const express = require('express') ;
const router = express.Router() ;
const log = require('log4js').getLogger('home') ;
const util = require('../util/utils') ;
const interviewUtil = require('../util/interview') ;
const solr = require('../util/solr') ;
const axios = require('axios') ;


let appConfig = null ;
        
function init(appConfigParm) {

  appConfig = appConfigParm ;
  router.get('/',		        async (req, res) => { showChatPage(req, res) }) ;
  router.post('/',          async (req, res) => { chat(req, res) }) ;
  router.post('/interview', async (req, res) => { chatWithInterview(req, res) }) ;
  return router ;  
}

async function showChatPage(req, res) {

  let systemPrompt = "Assistant is an intelligent chatbot that answers questions from user." ;
  let q = "" ;
  let temperature = 0 ;
  let maxTokens = 300 ;

  if (req.query) {
    if (req.query.systemPrompt) systemPrompt = req.query.systemPrompt ;
    if (req.query.q) q = req.query.q ;
    if (req.query.temperature) temperature = req.query.temperature ;
    if (req.query.maxTokens) maxTokens = req.query.maxTokens ;
  }

  res.render('chatPage', {req: req, appConfig: appConfig, systemPrompt: systemPrompt, q: q, 
                          temperature: temperature, maxTokens: maxTokens}) ;
}

async function chat(req, res) {

  console.log("in chat") ;

  let chatHistory = req.body ;
  console.log("GOT chatHistory:" + JSON.stringify(chatHistory).substring(0, 500) + " ...") ;

  // expect chatHistory to have props systemPrompt, temperature, rounds[] where each round has user and assistant

  try {
    let prompt = "<|im_start|>system\n" + chatHistory.systemPrompt + 
        "\n<|im_end|>" ;

    for (let round of chatHistory.rounds) {
      prompt += "\n<|im_start|>user\n" + round.user + "\n<|im_end|>" +
                "\n<|im_start|>assistant\n" ;
      if (round.assistant) prompt += round.assistant + "\n<|im_end|>" ;
      else break ;  // nothing means latest user input
    }

    console.log("sending prompt:" + prompt) ;

    let startResponseMarker = "<|im_start|>assistant\n" ;              

   // console.log("\n=================Summary prompt: " + prompt) ;

    let data = {
          "prompt": prompt,
          "use_beam_search": false,              
          "temperature": chatHistory.temperature,
          "n":1,
          "max_tokens": chatHistory.maxTokens,
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
   console.log("llm response: " + JSON.stringify(eRes.data)) ;

   let r = eRes.data.text[0] ;
   if (startResponseMarker) {
     let rs = r.lastIndexOf(startResponseMarker) ;
     if (rs >= 0) r = r.substring(rs + startResponseMarker.length) ;
   }

   res.status(200).send({ok: true, response: r}) ;

   console.log("\n========== ======= ==== Returned summary: " + r) ;
   return r ;
  }
  catch (e) {
    console.log("Error in chat: " +e) ;
    res.status(200).send({ok: false, err: JSON.stringify(e)}) ;
  }
}


async function chatWithInterview(req, res) {

  console.log("in chatWithInterview") ;

  let chatHistory = req.body ;
  console.log("GOT chatHistory:" + JSON.stringify(chatHistory).substring(0, 500) + " ...") ;

  // expect chatHistory to have interviewId and rounds[] where each round has user and assistant

  if (!chatHistory.interviewId) {
    res.status(400).send({ok: false, error: "No interview id supplied"}) ;
    return ;
  }

  let interview = {} ;
  try {
    interview = await interviewUtil.getInterview(chatHistory.interviewId) ;
  }
  catch (e) {
    console.log("Error in chatWithInterview getInterview " + chatHistory.interviewId + ": " + e) ;
    console.log(e.stack) ;
    res.json({ok: false, error: "Failed to find interview: " + chatHistory.interviewId  + " -  error " + e}) ;
    return ;
  }

  let chatMode =  chatHistory.chatMode ||  "chatty" ;


  let combinedUserPromptsAndResponses = "" ;
  if (chatHistory.newTopic) 
    combinedUserPromptsAndResponses = chatHistory.rounds[chatHistory.rounds.length - 1].user ;  
  else {
    for (let round of chatHistory.rounds) 
      combinedUserPromptsAndResponses += round.user + " " + 
         " " ; // ((round.assistant) ? (round.assistant + " ") : "") ;
  }

  // find best

  let ourEmbedding = await util.getEmbedding(combinedUserPromptsAndResponses) ;
  let keywordScaling = 0.9 ;

  let query = "({!knn f=embedding topK=50}" + JSON.stringify(ourEmbedding) + ")^" + keywordScaling + 
    " OR (" +

//  transcript chunks              
      "contentStemmed:(" + combinedUserPromptsAndResponses + ")^0.1 OR " +
      "content:(" + combinedUserPromptsAndResponses + ")^0.3 OR " +
      "contentStemmed:\"" + combinedUserPromptsAndResponses + "\"~5^0.3 OR  " +
      "content:\"" + combinedUserPromptsAndResponses + "\"~5^0.9 " +
    ")^" + (( 1 - keywordScaling) / 2) ;

//console.log("SET " + set + " filename " + filename) ;


query += "&fq=interviewId:\"" + chatHistory.interviewId + "\" AND partType:T" ;

let selectData = 
"&wt=json&rows=10" +
"&q=" + query + 
"&q.op=OR" +
"&fl=sessionId,sessionSeq,partType,partId,content,startcs,endcs,score" ; 

console.log("chat search query part: " + selectData.replace(/\[[^\]]*/, "[]..vectors..]")  + "\nurl: " + 
      appConfig.solr.getSolrBaseUrl() + "audio2SessionPart/select") ;
let solrRes = null ;

try {
  solrRes = await axios.post(
  appConfig.solr.getSolrBaseUrl() + "audio2SessionPart/select",
  selectData) ;
}
catch (e) {
  console.log("Error solr query " + e) ;
  res.status(400).send({ok: false, error: "Search error: " + e}) ;
  if( e.response) console.log(e.response.data) ; 
  return ;
}

console.log("search status: " + solrRes.status) ;

if (!((solrRes.status == 200) && solrRes.data && solrRes.data.response && solrRes.data.response.docs)) {
  console.log("chat search failed - no docs") ;
  res.status(400).send({ok: false, error: "No docs"}) ;
  return ;
}

let systemPrompt = null ;

if (chatMode == "chatty") 
  systemPrompt = "Assistant is an intelligent chatbot that processes a partial oral history transcript to answer questions from " +
     "from the user.  Assistant's response only contains information from the supplied transcript, " +
     "and cites the session and timestamp of transcript fragments used. " +
     " The title of the oral history is \"" + interview.title + "\".\n" +
     "Here follows the partial transcripts:\n"  ;
else 
  systemPrompt = "Assistant is an intelligent chatbot that processes a partial oral history transcript to help the user " +
    "locate parts of the transcript that will answer their question. " +
    "Assistant's response contains minimal commentary and just refers the user to the relevant part or parts of the transcript by using " +
    "the session and time of those relevant parts that answer user's question, " +
    "or responds that the transcript extracts do not contain relevant information. " +
    " The title of the oral history is \"" + interview.title + "\".\n" +
    "Here follows the partial transcripts:\n"  ;


    console.log("\n\nSYSTEMPROMPT " + chatMode + ": " + systemPrompt + "\n") ;
for (let doc of solrRes.data.response.docs) {
  systemPrompt += "From session " + (doc.sessionSeq + 1) + " at time " + formatTime(doc.startcs) + ": " +
                  doc.content + "\n" ;
}

  
  try {
    let prompt = "<|im_start|>system\n" + systemPrompt + 
        "\n<|im_end|>" ;

    for (let round of chatHistory.rounds) {
      prompt += "\n<|im_start|>user\n" + round.user + "\n<|im_end|>" +
                "\n<|im_start|>assistant\n" ;
      if (round.assistant) prompt += round.assistant + "\n<|im_end|>" ;
      else break ;  // nothing means latest user input
    }

    console.log("sending prompt:" + prompt) ;

    let startResponseMarker = "<|im_start|>assistant\n" ;              

   // console.log("\n=================Summary prompt: " + prompt) ;

    let data = {
          "prompt": prompt,
          "use_beam_search": false,              
          "temperature": 0,
          "n":1,
          "max_tokens": 300,
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
   console.log("llm response: " + JSON.stringify(eRes.data)) ;

   let r = eRes.data.text[0] ;
   if (startResponseMarker) {
     let rs = r.lastIndexOf(startResponseMarker) ;
     if (rs >= 0) r = r.substring(rs + startResponseMarker.length) ;
   }


   let i = r.indexOf("<") ;
   if (i > 0) r = r.substring(0, i) ;
   console.log("\n========== ======= ==== Returned summary: " + r) ;
   res.status(200).send({ok: true, response: r}) ;
   return r ;
  }
  catch (e) {
    console.log("Error in chat: " +e) ;
    res.status(200).send({ok: false, err: JSON.stringify(e)}) ;
  }
}


function formatTime(cs) {

  if (!cs) return "0" ;
  let secs = Math.floor(cs / 100) ;
  let mins = Math.floor(secs / 60) ;
  secs = secs - mins * 60 ;
  return ((mins < 10) ? "0" : "") + mins + ":" +  ((secs < 10) ? "0" : "") + secs ;
}

module.exports.init = init ;