const express = require('express') ;
const router = express.Router() ;
const log = require('log4js').getLogger('home') ;
const util = require('../util/utils') ;
const https = require('https') ;
const fs = require('fs') ;
const interviewUtil = require('../util/interview') ;
 TODO - fix 
let appConfig = null ;
        
function init(appConfigParm) {

  appConfig = appConfigParm ;
  router.get ('/',		              async (req, res) => { correct(req, res) }) ;
  router.post('/editedTranscript',  async (req, res) => { editedTranscript(req, res) }) ;
  return router ;  
}

async function editedTranscript(req, res) {   

  try {
    let id = req.query.id ;
    console.log("editedTranscript got id " + id) ;

    if (!id.startsWith("nla.obj")) throw new Error("Unexpected correct id - no nla obj") ;

    let newAudioTranscript = req.body ;
    console.log("GOT JSON BODY:" + JSON.stringify(newAudioTranscript).substring(0, 500) + " ...") ;

    // note, the transcript DOES NOT contain the  id, metadata and history props, and if it does, we
    // replace them anyway from the stored versions (and we updated the history)

    let oldTranscriptAsString = "" ;
    try {
      let doc = await docUtil.getDoc(id) ;
      for (let j of doc.transcriptJson) oldTranscriptAsString += j ;
    }
    catch (e) {
      console.log("editedTranscript error in getDoc:" + e) ;
      console.log(e.stack) ;
      throw new Error("Error in getDoc:" + e)
    }
  

    // save old transcript to a file

    let historyTranscriptName = appConfig.relativeTranscriptsDir + "history/" +
        id + "--replaced-" + util.currentTimestampAsYYYYMMDDHHmmSSSSS() + 
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

    newAudioTranscript.id = oldTranscript.id ;
    newAudioTranscript.metadata = oldTranscript.metadata ;
    newAudioTranscript.history = oldTranscript.history ;
    newAudioTranscript.history.push("Edited by UNKNOWN on " + util.formatAsSqlTimestamp(new Date())) ;

    // save new version to the database, queue for reindexing
 
    let contents = null ;

    console.log(" id " + newAudioTranscript.id + "chunks: " + newAudioTranscript.transcript.chunks.length) ;

    if (newAudioTranscript.transcript.chunks.length > 0) {

      // optimise speakers for lookup
      let speakerLookup = [] ;
      for (let sp of newAudioTranscript.speakers) speakerLookup["sp" + sp.id] = sp.name ;
      
      for (let chunk of newAudioTranscript.transcript.chunks) {
        if (contents == null) contents = "" ;
        else contents += "\n\n" ;
        contents += speakerLookup["sp" + chunk.speaker] + ":" ;
        for (let c of chunk.content) 
          contents += " " + c.t ;            
      }
    }

    if (!contents || contents.length < 1) throw "File has no or little content" ;
    
    console.log("contents length: " + contents.length) ;

    mainDoc = await docUtil.storeMainAudioDocAndQueueSummarisation(newAudioTranscript, oldTranscript, null, contents) ;
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
    let t = req.query.id ;
    if (!t.startsWith("nla.obj")) throw new Error("Unexpected correct id - no nla obj") ;
    let i = t.lastIndexOf("_") ;
    if (i < 0) throw new Error("Unexpected correct id - no time") ;
    let startSec = Number(t.substring(i+1)) ;
    let id = t.substring(0, i).replace("_", "-") ;

    // throw new Error("Not implemented yet, but id=" + id + ", startSec=" + startSec) ;


    let doc = {} ;
    let err = null ;
    try {
      doc = await docUtil.getDoc(id) ;
      //console.log("id:" + req.query.id + " doc:" + JSON.stringify(doc)) ;
    }
    catch (e) {
      console.log("Error in getDoc:" + e) ;
      throw e ;
    }

    res.render('correct', {req: req, appConfig: appConfig, doc: doc, startSec:startSec }) ;

  }
  catch (err) {
    console.log("correct failed " + err) ;
    console.log("Stack: " +  err.stack) ;
    res.write("correct failed: " + err) ;
    res.end() ;
  }
}

module.exports.init = init ;