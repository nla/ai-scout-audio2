const express = require('express') ;
const router = express.Router() ;
const log = require('log4js').getLogger('home') ;
const util = require('../util/utils') ;
const solr = require('../util/solr') ;
const interviewUtil = require('../util/interview') ;
const axios = require('axios') ;
const fs = require('fs') ;

let appConfig = null ;


function init(appConfigParm) {

  appConfig = appConfigParm ;
  router.get ('/outline',  async (req, res) => { outline(req, res) }) ;
  router.get ('/transcriptJSON',  async (req, res) => { transcriptJSON(req, res) }) ;
  //router.get ('/oneOff',  async (req, res) => { oneOff(req, res) }) ;
  return router ;  
}

async function transcriptJSON(req, res) {

  if (!req.query) {
    res.json({ok: false, error:"no doc id"}) ;
    return ;
  }
  
  if (!req.query.interviewId) {
    res.json({ok: false, error:"no interviewId"}) ;
    return ;
  }
  if (!req.query.sessionId) {
    res.json({ok: false, error:"no sessionId"}) ;
    return ;
  }  

  let interview = {} ;
  let err = null ;
  try {
    interview = await interviewUtil.getInterview(req.query.interviewId) ;
  }
  catch (e) {
    console.log("Error in transcriptJSON getInterview:" + e) ;
    console.log(e.stack) ;
    err = e ;
  }

  // find the session

  let session = null ;
  if (interview.sessions) 
    for (let s of interview.sessions) 
      if (req.query.sessionId == s.sessionId) {
        session = s ;
        break ;
      }

  if (!session) throw new Error("Session " + req.query.sessionId + "not found in interview " + req.query.interviewId) ;

  let jstr = "" ;
  for (let j of session.transcriptJson) jstr += j ;
  res.setHeader('Content-Type', 'application/json') ;
  res.end(jstr) ;
}


async function outline(req, res) {

  if (!req.query) {
    res.json({ok: false, error:"no doc id"}) ;
    return ;
  }
  
  if (!req.query.id) {
    res.json({ok: false, error:"no doc id"}) ;
    return ;
  }

  let interview = {} ;
  let err = null ;
  try {
    interview = await interviewUtil.getInterview(req.query.id) ;
    //console.log("id:" + req.query.id + " interview:" + JSON.stringify(interview)) ;
  }
  catch (e) {
    console.log("Error in getInterview:" + e) ;
    console.log(e.stack) ;
    err = e ;
    res.json({ok: false, error: "Failed to find interview: " + req.query.id + " -  error " + err}) ;

    return ;
  }


  // make a copy without unnecessary junk for outline.  At the moment, we send back all the sessions
  // but maybe an optimisation is to load these on demand - some interviews have LOTS and some will be VERY big

  let iv = {
    interviewId: interview.interviewId,
    title: interview.title,
    subtitle: interview.subtitle,
    collection: interview.collection,
    interviewee: interview.interviewee,
    interviewer: interview.interviewer,
    sponsor: interview.sponsor,
    yyyymmdd: interview.yyyymmdd,
    year: interview.year,
    loadedBy: interview.loadedBy,
    loadedDate: interview.loadedDate,
    summary: interview.summary,
    indexToLowerContent: interview.indexToLowerContent,
    embedding: interview.embedding
  }
  iv.sessions = [] ;
  for (let s of interview.sessions) {
    let ivs = {
      sessionId: s.sessionId,
      sessionSeq: s.sessionSeq,
      deliveryObject: s.deliveryObject,
      yyyymmdd: s.yyyymmdd,
      year: s.year,
      sessionId: s.sessionId,
      summary: s.summary,
      transcriptJson: s.transcriptJson,
      indexToLowerContent: s.indexToLowerContent 
    } ;

    ivs.parts = [] ;
    for (let p of s.parts) 
      ivs.parts.push(copyPartsRecursive(p)) ;

    iv.sessions.push(ivs) ;
  }

  try {
    await interviewUtil.getMostSimilar(iv) ;
  }
  catch (e) {
    console.log("Error in getMostSimilar:" + e) ;
    console.log(e.stack) ;
    err = e ;
  }

  delete iv["embedding"] ; // dont need this now
  res.render('outline', {req: req, appConfig: appConfig, interview: iv, err:err }) ;
}


function copyPartsRecursive(p) { // copy part attrs and sub-parts

  let np = {
    partType: p.partType,
    partId: p.partId,
    startcs: p.startcs,
    endcs: p.endcs
  }
  if (p.partId.startsWith("S")) np.content = p.content ;
  if (p.parts) {
    np.parts = [] ;
    for (let subPart of p.parts) 
      np.parts.push(copyPartsRecursive(subPart)) ;
  }
  return np ;
}

// anything I want to do once...
/*
async function oneOff(req, res) {

    console.log("running oneOff") ;
    // today I want to extract all the summary embeddings with the file name
    // today I want to extract all the summary texts with the file name
    // const outFile = "/home/kfitch/audio/embeddingsPerFile.txt" ;
    const outFile = "/home/kfitch/audio/summariesPerFile.txt" ;

    let selectData = 
    "wt=json&rows=9999" +
    "&q=id:*" + 
    "&fl=id,summary" ;

    let solrRes = null ;


    try {
      solrRes = await axios.get(
        appConfig.solr.getSolrBaseUrl() + "audio/select?" + selectData) ;
    }
    catch (e) {
      console.log("Error solr getDoc " + e) ;
      console.log(e.stack) ;
      if( e.response) console.log(e.response.data) ; 
      res.json({ok: false}) ;
      return ;
    }
    let contents = "" ;

    if ((solrRes.status != 200) || !(solrRes.data && solrRes.data.response && solrRes.data.response.docs))
      throw "SOLR list uploads unexpected response: " + solrRes.status + " or nothing found" ;

    for (let i=0;i<solrRes.data.response.docs.length;i++) {
      let sdoc = solrRes.data.response.docs[i] ;
      contents += sdoc.id + " TEXT: " + JSON.stringify(sdoc.summary) + "\n" ;
    }
    fs.writeFileSync(outFile, contents) ;
    console.log("done " + outFile) ;

    res.json({ok: true}) ;
}
*/
module.exports.init = init ;