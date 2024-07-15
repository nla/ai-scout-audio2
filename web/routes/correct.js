const express = require('express') ;
const router = express.Router() ;
const log = require('log4js').getLogger('home') ;
const util = require('../util/utils') ;
const https = require('https') ;
const fs = require('fs') ;
const interviewUtil = require('../util/interview') ;
let appConfig = null ;

// TODO - change from doc to session (in progress)

function init(appConfigParm) {

  appConfig = appConfigParm ;
  router.get ('/',		              async (req, res) => { correct(req, res) }) ;
  router.post('/editedTranscript',  async (req, res) => { editedTranscript(req, res) }) ;
  return router ;  
}



async function editedTranscript(req, res) {   

  try {
    let interviewId = req.query.interviewId ;
    let sessionId = req.query.sessionId ;
    console.log("editedTranscript got id " + interviewId) ;

    if (!interviewId.startsWith("nla.obj")) throw new Error("Unexpected correct interviewId - no nla obj") ;
    if (!sessionId.startsWith("nla.obj")) throw new Error("Unexpected correct sessionId - no nla obj") ;

    let newAudioTranscript = req.body ;
    console.log("GOT JSON BODY:" + JSON.stringify(newAudioTranscript).substring(0, 500) + " ...") ;

    // TODO converting from single interview to sessions...
    // each session transcript is "standalone"

    let interview = await interviewUtil.getInterview(interviewId) ;

    let session = null ;
    if (interview.sessions) 
      for (let s of interview.sessions) 
        if (sessionId == s.sessionId) {
          session = s ;
         break ;
        }

    if (!session) throw new Error("Correct session " + sessionId + "not found in interview " + interviewId) ;

    let oldTranscriptAsString = "" ;
    for (let j of session.transcriptJson) oldTranscriptAsString += j ;

    // save old transcript to a file

    let historyTranscriptName = appConfig.relativeTranscriptsDir + "history/" +
        interviewId + "--" + sessionId + "--replaced-" + util.currentTimestampAsYYYYMMDDHHmmSSSSS() + 
        "-R" + Math.floor(Math.random() * 1000) + ".json" ;
    try {
      fs.writeFileSync(historyTranscriptName, oldTranscriptAsString) ;
    }
    catch (e) {
      console.log("editedTranscript error saving old transcript as " + historyTranscriptName + " err: " + e) ;
      console.log(e.stack) ;
      throw new Error("Error in editedTranscript saving old transcript :" + e) ;
    }

    let oldTranscript = JSON.parse(oldTranscriptAsString) ;

    // copy fields that cant be changed (and shouldnt be supplied)

    newAudioTranscript.sessionId = oldTranscript.sessionId ;
    newAudioTranscript.seq = oldTranscript.seq ;
    newAudioTranscript.yyyymmdd = oldTranscript.yyyymmdd ;
    newAudioTranscript.deliveryObject = oldTranscript.deliveryObject ;
    
    newAudioTranscript.history = oldTranscript.history || [] ;

    newAudioTranscript.history.push("Edited by UNKNOWN on " + util.formatAsSqlTimestamp(new Date())) ;

    // save new version to the database, queue for reindexing
 
    let contents = null ;

    console.log(" id " + newAudioTranscript.sessionId + " chunks: " + newAudioTranscript.transcript.chunks.length) ;

    let newSession  = {
      interviewId: session.interviewId,
      sessionId: session.sessionId,
      deliveryObject: session.deliveryObject,
      transcript: newAudioTranscript.transcript,
      speakers: newAudioTranscript.speakers, 
      seq: newAudioTranscript.seq,
      sessionSeq: newAudioTranscript.seq,
      yyyymmdd: session.yyyymmdd,
      title: session.title,
      collection: session.collection,
      loadedBy: session.loadedBy,
      loadedDate: session.loadedDate,
      interviewee: session.interviewee,
      interviewer: session.interviewer,
      sponsor: session.sponsor
    }

    console.log("   speakers: " + JSON.stringify(newSession.speakers)) ;
    
    if (newSession.transcript.chunks.length > 0) {
      
      let speakerLookup = [] ;      // optimise speakers for lookup
      for (let sp of newSession.speakers) speakerLookup["sp" + sp.id] = sp.name ;
      
      for (let chunk of newSession.transcript.chunks) {
        if (contents == null) contents = "" ;
        else contents += "\n\n" ;
        contents += speakerLookup["sp" + chunk.speaker] + ":" ;
        for (let c of chunk.content) 
          contents += " " + c.t ;            
      }
    }

    if (!contents || contents.length < 16) {
      console.log("Session " + newSession.sessionId + " has no or little content") ;
      if (!contents) contents = "No transcript content for this session." ;
    }
  
    console.log("Session " + newSession.sessionId + " contents length: " + contents.length) ;

    await interviewUtil.storeSessionAndQueueSummarisation(interview, newSession, contents) ;          
    
    // after sessions are done, queue the interview  

    console.log("QUEUING INTERVIEW SUMMARY GENERATION ---") ;
    await interviewUtil.queueInterviewSummaryGeneration(interview) ; 

    res.status(200).send({message: "ok"}) ;
  }
  catch (err) {
    console.log("Error processing corrected transcript: " + err) ;   
    console.log(err.stack) ;
    res.status(500).send({message: "err " + err}) ;
  }
}

async function correct(req, res) {   
  

  try {

    let interviewId = req.query.interviewId ;
    if (!interviewId.startsWith("nla.obj")) throw new Error("Unexpected correct interviewId id - no nla obj") ;

    let sessionId = req.query.sessionId ;
    if (!sessionId.startsWith("nla.obj")) throw new Error("Unexpected correct session id - no nla obj") ;

    let i = sessionId.lastIndexOf("_") ;
    if (i < 0) throw new Error("Unexpected correct session id - no time") ;
    let startSec = Number(sessionId.substring(i+1)) ;
    sessionId = sessionId.substring(0, i).replace("_", "-") ;



    let interview = {} ;
    let err = null ;
    try {
      interview = await interviewUtil.getInterview(interviewId) ;
    }
    catch (e) {
      console.log("Error in correct getInterview:" + e) ;
      throw e ;
    }

    // find the session

    let session = null ;
    if (interview.sessions) 
      for (let s of interview.sessions) 
        if (sessionId == s.sessionId) {
          session = s ;
          break ;
        }

    if (!session) throw new Error("Session " + sessionId + "not found in interview " + interviewId) ;
    

    res.render('correct', {req: req, appConfig: appConfig, interviewId: interviewId,
      title: interview.title,
      session: session, startSec:startSec }) ;

  }
  catch (err) {
    console.log("correct failed " + err) ;
    console.log("Stack: " +  err.stack) ;
    res.write("correct failed: " + err) ;
    res.end() ;
  }
}

module.exports.init = init ;