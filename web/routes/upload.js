const express = require('express') ;
const router = express.Router() ;
const log = require('log4js').getLogger('home') ;
const util = require('../util/utils') ;
const solr = require('../util/solr') ;
const interviewUtil = require('../util/interview') ;

const FormData = require('form-data') ; // for uploadAll

const axios = require('axios') ;
const formidable = require('formidable') ;
const fs = require('fs') ;
const readline = require('readline') ;
const { XMLParser, XMLBuilder, XMLValidator} = require("fast-xml-parser") ;



let appConfig = null ;
        
function init(appConfigParm) {

  appConfig = appConfigParm ;
  router.get ('/',		    async (req, res) => { uploadForm(req, res) }) ;
  router.post('/',		    async (req, res) => { uploadPost(req, res) }) ;
  router.get ('/all',	    async (req, res) => { uploadAll(req, res) }) ;
  router.get ('/createInterviewSummary',	    async (req, res) => { createInterviewSummary(req, res) }) ;
  router.get ('/recreateInterviewSummary',	  async (req, res) => { recreateInterviewSummary(req, res) }) ;
  router.get ('/addDetailedLinksToInterviewAndSessionSummaries',	    async (req, res) => { addDetailedLinksToInterviewAndSessionSummaries(req, res) }) ;
  router.get ('/update',  async (req, res) => { updateForm(req, res) }) ; // just set and title
  router.post('/update',  async (req, res) => { updatePost(req, res) }) ; // just set and title
  router.get('/buildVocabList',               async (req, res) => { buildVocabList(req, res) }) ; // one off to build word freq for scoring
  return router ;  
}


async function buildVocabList(req,res) {  // no, nothin to do with uploads - just here coz Im too lazy  to create an admin route

  // read file en_full.txt in data (from https://github.com/hermitdave/FrequencyWords/tree/master/content/2018/en)
  // keep everything with 20 of more
  // discard everything with '
  // take logs of score (first entry will be highest, lowest is assumed to be 1 (more)) and scale logs: 0..100
  // write to data/workFreq.json


  let freqList = {} ;
  const fileStream = fs.createReadStream("data/en_full.txt") ;

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  }) ;

  let added = 0 ;
  let max = 0 ;
  let scale = 0 ;
  for await (const line of rl) {
    let parts = line.split(" ") ;
    if (parts.length != 2) break ;
    if (parts[0].indexOf("'") >= 0) continue ;
    if (parts[1] < 20) break ;
    if (!added) { // first line
      max = parts[1] ;
      let logMax = Math.log10(max) ;
      scale = 100 / logMax ;
      console.log("Max from " + line + "  -- scale is " + scale) ;
    }
    let i = parts[0].indexOf('.') ;
    if (i == 0) continue ;
    if (i > 0) parts[0] = parts[0].substring(0, i) ; // remove stuff after .
    if (isNaN(parts[0])) {  // dont care for numbers
      let freq = Math.round(Math.log10(parts[1]) * scale) ;
      if (!freqList[parts[0]]) {
        freqList[parts[0]] = freq ;
        added++ ;
      }
    }
  }
  await fs.promises.writeFile("static/javascript/freqList.js", 
      "let freqList = " + JSON.stringify(freqList) + "; ") ;
  res.write("added " + added + " scale " + scale) ;
  res.end() ;
}
/* move to client side
let freqList = null ;

async function getFreqList() {

  if (!freqList) {
    try {
      freqList = JSON.parse(await fs.promises.readFile("data/freqList.json", "utf8")) ;
    }
    catch (e) {
      console.log("cant read word freq list:" + e) ;
      console.log(e.stack) ;
    }
  }
  return freqList ;
}
*/


async function createInterviewSummary(req, res) {

  let id = req.query.id ;
  if (!id) res.write("id missing") ;
  else {
    res.write("id is " + id) ;
    let now = new Date().getTime() ;
    let enqueueDoc = [{
      id: "" + now,
      timestamp: Math.floor(now / 1000),  // secs - we store as an int in SOLR
      docid: "**INTERVIEW**" + id,
      transcriptJson: "{}"
    }] ;
    await solr.addOrReplaceDocuments(enqueueDoc, "audioReindexQueue") ;
    res.write("\n Interview ENQUEUED for reindex") ;
  }
  res.end() ;
}


async function addDetailedLinksToInterviewAndSessionSummaries(req, res) {

  console.log("addDetailedLinksToInterviewAndSessionSummaries") ;

/*
  <!-- interview and session summaries contain links per sentence to best (closest) content that sourced
  the summary sentence, based on embedding distance.  There is one entry in the string for each
  summary sentence with format {seq}{partId} for interview summaries, where (seq} is the session seq
  and with format {partId} for session summaries.  Space separated
  eg 0S 1S02 2S 2S01-03   (for an interview)
  eg S00-00  S00-03  S00-03-00  T00-05-03
-->
<field name="indexToLowerContent" type="string"  indexed="false" stored="true" multiValued="false"/>
*/

  // find interviews needing to be done..

  let selectData = 
  "wt=json&rows=99999" +
 // "&q=partId:I AND  interviewId:nla.obj-193825591" +
  "&q=partId:I AND -indexToLowerContent:*" +  
  "&fl=interviewId" ;

  let solrRes = null ;

  //console.log("about to get " + appConfig.solr.getSolrBaseUrl() + "audio2SessionPart/select?" + selectData) ;
  try {
    solrRes = await axios.get(
      appConfig.solr.getSolrBaseUrl() + "audio2SessionPart/select?" + selectData) ;
  }
  catch (e) {
    console.log("Error solr reading parts in update " + e) ;
    if( e.response) console.log(e.response.data) ; 
    throw e ;
  }

  //console.log("createOutlines status: " + solrRes.status) ;
  if ((solrRes.status != 200) || !(solrRes.data && solrRes.data.response && solrRes.data.response.docs))
    throw "SOLR reading parts in update unexpected response: " + solrRes.status + " or nothing found" ;

  let interviewDocs = solrRes.data.response.docs ;
  let c = 0 ;
  for (let ivDoc of interviewDocs) {

    res.write("processing " + ivDoc.interviewId + "\n") ;
    let interviewId = ivDoc.interviewId ;
    console.log("\naddDetailedLinksToInterviewAndSessionSummaries starting " + interviewId) ;
    let iv = await interviewUtil.getInterview(interviewId) ;

    console.log("\naddDetailedLinksToInterviewAndSessionSummaries build start for " + interviewId) ;
    await interviewUtil.buildIndexToLowerContent(iv) ;
    console.log("\naddDetailedLinksToInterviewAndSessionSummaries build done for " + interviewId) ;
/*
    let solrInterview = interviewUtil.getInterviewSOLR(interviewId) ;
    solrInterview.indexToLowerContent = iv.indexToLowerContent ;
    interviewUtil.updateInterviewSOLR(solrInterview) ;
    console.log("addDetailedLinksToInterviewAndSessionSummaries finished " + interviewId) ;
    */
   //if (c++ >= 0) break ;
  }
  res.end() ;
}

async function recreateInterviewSummary(req, res) { // one off hack

  let infile = "/home/kfitch/audio2/multiSession" ;

  require('fs').readFileSync(infile, 'utf-8').split(/\r?\n/).forEach(async function (line) {
    // console.log(line);  1054    "nla.obj-201991915"

    let k = line.indexOf('\t') ;
    let seq = line.substring(0, k) ;
    let i = line.indexOf('"') ;
    let j = line.indexOf('"', i + 1) ;
    let id = line.substring(i+1, j) ;
    res.write("seq is " + seq + " id is " + id) ;
    let now = new Date().getTime() ;
    let enqueueDoc = [{
      id: seq,
      timestamp: Math.floor(now / 1000),  // secs - we store as an int in SOLR
      docid: "**INTERVIEW**" + id,
      transcriptJson: "{}"
    }] ;
    await solr.addOrReplaceDocuments(enqueueDoc, "audioReindexQueue") ;
    res.write("\n Interview ENQUEUED for reindex") ;
  }) ;
  res.end() ;
}

const AUGMENT_TEI_WITH_CONFIDENCE = true ;

async function uploadAll(req, res) {

   const sourceDir = "/home/kfitch/audio/francis-nla-oral-history/uat-transcripts-4k" ;
  //const sourceDir = "/home/kfitch/audio/redo/iv/" ;
  let dirs = fs.readdirSync(sourceDir) ;

  let alreadyLoaded = 0 ;
  let attempts = 0 ;
  let successes = 0 ;

  let kkk = 0 ;
  for (let dir of dirs) {

 /*   if ((dir ==  "nla.obj-220466827") || // Brandy     ((dir == 'nla.obj-195963802') || (dir == 'nla.obj-195963802')) ; //nla.obj-195963802
        (dir ==  "nla.obj-218166365")) ; // egan
    else continue ;
*/
/*
    if ((dir ==  "nla.obj-215073920") || // quist     
        (dir == "nla.obj-220251147") || // Nayinggul  -- redo
        (dir == "nla.obj-219901040") || // Jackson
        (dir == "nla.obj-219841931") || // Hammersley
        (dir == "nla.obj-207094179") || // Leong

        (dir == "nla.obj-215788512") || // Hanke
        (dir == "nla.obj-220469166") || // McLennan
        (dir == "nla.obj-220071333") || // Simpson

        (dir ==  "nla.obj-218270215")) ; // penhall  	
        */
      //if (dir == "nla.obj-220251147") ; // Nayinggul  -- redo
      // if (dir == "nla.obj-216174421") ; // Ellen Buyers

    if (dir == "nla.obj-218181263") ;
      /*
    if ((dir == "nla.obj-216363690") || (dir == "nla.obj-216255062") ||
    (dir == "nla.obj-216204478") || (dir == "nla.obj-216203104") ||
    (dir == "nla.obj-216192711") || (dir == "nla.obj-216199473") ||
    (dir == "nla.obj-216178020") || (dir == "nla.obj-216299603") ||
    (dir == "nla.obj-216193187") || (dir == "nla.obj-216207988") ||

    (dir == "nla.obj-216277724") || (dir == "nla.obj-216347698") ||
    (dir == "nla.obj-219630248") || (dir == "nla.obj-218459822") ||
    (dir == "nla.obj-217919415") || (dir == "nla.obj-195853298") ||
    (dir == "nla.obj-220250383") || (dir == "nla.obj-220575530") 
      */

    else continue ;
     
    //  if (dir != 'nla.obj-206971479') continue ;
    //if (dir != 'nla.obj-193368612') continue ; // only 1 session
    //if (dir != 'nla.obj-192214659') continue ; // DEBUG 2 sessions no date
    //if (f != 'nla.obj-214900586-tc.xml') continue ; // DEBUG BIG
  // if (dir != 'nla.obj-214900586') continue ; // BIG
    
  // if (dir != 'nla.obj-193561776') continue ; // BIG

  kkk++ ;
   //if (kkk <= 4500) continue ;
   //if (kkk > 994500) break ;
    res.write("Dir: " + JSON.stringify(dir) + "\n") ;

    // expect a dir name like nla.obj-
    if (!dir.startsWith("nla.obj-")) {
      res.write(" ignored\n") ;
      continue ;
    }

    let fullDir = sourceDir + "/" + dir ;

    if (!fs.lstatSync(fullDir).isDirectory()) {
      res.write(" not dir\n") ;
      continue ;
    }


    let files = fs.readdirSync(fullDir) ;
    let any = false ;
    for (let f of files) {

      // expect a file name like nla.obj-214299046-tc.xml
      if (!f.startsWith("nla.obj-") || !f.endsWith("-tc.xml")) {
        res.write(" ignored1 /" + f + "/\n") ;
        continue ;
      }

      let stat = fs.statSync(fullDir + "/" + f); 
      if (stat.size < 5000) {
        res.write(" File " + f + " Too small\n") ;
        continue ;
      }
      if (any) {
        res.write(" !? IGNORING 2nd tc xml!  DUPLICATE tc xml files in dir? " + fullDir + "\n") ;
        continue ;
      }
      any = true ;
    /* DEBUG
      try {
        let iv = await interviewUtil.getInterview(dir) ;
        alreadyLoaded++ ;
        res.write(" already loaded\n") ;
        continue ;
      }
      catch (err) {
        res.write(" Not found " + err + "\n") ;
      }    
      */
      res.write(" Attempting to load..\n") ;
    
      attempts++ ;

      try {
        let i = f.lastIndexOf("-tc.xml") ;
        let interviewId = f.substring(0, i) ; // nla.obj-214299046-tc.xml to nla.obj-214299046
        if (interviewId != dir) {
          res.write(" !? dir is " + dir + " BUT tc xml is " + f + "\n") ;
          continue ;
        }        

        let teiFilename = fullDir + "/" + f ;

        let filenameToIngest = (AUGMENT_TEI_WITH_CONFIDENCE) 
                                  ? await augmentTEIwithConfidence(res, fullDir, f) : teiFilename ;
       // if (filenameToIngest) return ; // debug
        console.log("Attempting to load interview " + f + "\t\t as: " + interviewId) ;
        const form = new FormData();
        form.append('collection', 'Other') ;
        form.append('replace', 'n') ;
        // before augmentation: form.append('uploadedFile', fs.createReadStream(fullDir + "/" + f), f) ;
        form.append('uploadedFile', fs.createReadStream(filenameToIngest), f) ;

        // NOTE: need env to stop axios worrying about self-signed cert - before running node:
        // export NODE_TLS_REJECT_UNAUTHORIZED='0'
  
        const response = await axios.post("https://127.0.0.1:" + appConfig.port + "/upload", form, {
          headers: {
            ...form.getHeaders()
          },
        });
        res.write(" upload resp:" + response.status + "\n") ;

        if (AUGMENT_TEI_WITH_CONFIDENCE &&  (teiFilename != filenameToIngest)) {
          console.log("about to delete " + filenameToIngest) ;
          fs.unlinkSync(filenameToIngest) ;  
        }
        console.log("Got UPLOAD resp " + response.status) ;
        if (response.status == 200) successes++ ;  
      }
      catch (err1) {
        res.write("FAILED to load " + f + " err:" + err1) ;
        console.log("FAILED to load " + f + " err:" + err1) ;
        console.log(err1.stack) ;
      }
    }
    if (!any) res.write("***No tc xml in dir " + dir + "\n") ;
  }
  res.write("\nalreadyLoaded " + alreadyLoaded + ", attempts " + attempts + ", successes " + successes) ;
  res.end() ;
}

// experiment 26Jul - lets add score/confidence into the tei so we can store it in the json to help QAers looking at transcript.

async function augmentTEIwithConfidence(res, fullDir, teiFilename) {

    /*  read and copy lines to temp output
        looking for lines denoting session like <div1 id="nla.oh-6545-0046-0001_nla.obj-220466834" n="1" type="Session">
        The last part nla.obj-220466834 is name of subdir we hope to find which will contain nla.obj-220466834.json
        We read json:
              {"segments": [{"start": 1.038, "end": 10.543, 
                            "text": " This is an interview with Larry ...",
                            "words": [
                               {"word": "This", "start": 1.038, "end": 1.258, "score": 0.635},
                               {"word": "is", "start": 1.598, "end": 1.718, "score": 0.758}, 
        
        and build a list of all words
        As we read through tei
              <seg id="T0">
                <timeRange from="00:00:01:03" to="00:00:01:25"/>     
                <seg>This</seg>
              </seg>
              <seg id="T1">
                <timeRange from="00:00:01:59" to="00:00:01:71"/>
                <seg>is</seg>
              </seg>

        we augment the inner seg with a c (confidence) of round(whisperx score * 100) - will be 0..100

          <seg id="T0">
            <timeRange from="00:00:01:03" to="00:00:01:25"/>     
            <seg c="64">This</seg>
          </seg>
          <seg id="T1">
            <timeRange from="00:00:01:59" to="00:00:01:71"/>
            <seg c="76">is</seg>
          </seg>

      Write out the tei to a tmp place - worrying about cleaning it up later...

      TODO add f=n - some word frequency measure/score, to draw attn to unusual words - some log freq measure, with out-of-vocab words given 1

      */

     
      console.log("Reading TEI from " + fullDir + "/" + teiFilename) ;
      try {
        let teiStr =  fs.readFileSync(fullDir + "/" + teiFilename, 'utf8').toString() ;
        const parser = new XMLParser({
          ignoreAttributes: false,
         // preserveOrder: true,
          attributeNamePrefix : "@_"
        }) ;
    
        const teiWrapper = parser.parse(teiStr) ;
        const tei = teiWrapper["TEI.2"] ;
        if (!tei) console.log("** NO TEI.2 element") ;

 
        // div1 are sessions.  If not an array, make it one..
        div1s =  (tei.text && tei.text.body && tei.text.body.div1) ? tei.text.body.div1 : null ;
        if (div1s == null) {
          console.log("No div1s - no sessions") ;
          return null ;
        }
        if (!Array.isArray(div1s)) div1s = [ div1s ] ; // turn into an array...
    
        for (let div1 of div1s) { // each session
    
          console.log("processing div1: " + JSON.stringify(div1).substring(0, 200) + " ...") ;

          if (!div1.div2) {
            console.log("No transcript for session " + div1["@_id"]) ;
            continue ;
          }
          let i =  div1["@_id"].indexOf("_") ; // "nla.oh-6134-0000-0001_nla.obj-219135352
          if (i <= 0) throw new Error("unexpected session ids from div1 id: " +  div1["@_id"]) ;

          let sessionId =  div1["@_id"].substring(i+1) ;

          let sessionJSONfilename = fullDir + "/" + sessionId + "/" + sessionId + ".json" ;

          // json exist?

          if (!fs.existsSync(sessionJSONfilename)) {
            res.write("Cant find json transcript " + sessionJSONfilename) ;
            return fullDir + "/" + teiFilename ;
          }

          // ok, read original (raw) json transcript with score
         

          let tsj = JSON.parse(await fs.promises.readFile(sessionJSONfilename, "utf8")) ;
          let wordList = tsj.word_segments ;
          console.log("from " + sessionJSONfilename + " tsj word segments len=" + wordList.length) ;
          let wlc = 0 ; // current word

          const div2 = div1.div2 ;
    
          console.log("div2 is " + div2)
          if (div2.sp) {  
            let sp = div2.sp ;
            if (!Array.isArray(sp)) sp = [ sp ] ; // turn into an array...
            console.log("*** 29may sp count is " + sp.length) ;
    
            for (let content of sp) {   
              let p = content.p ;
              if (p) {
                let ps = Array.isArray(p) ? p : [p] ;
                for (let px of ps) {
                  let segs = px.seg ;
                  if (segs === undefined) continue ;
                  if (!Array.isArray(segs)) segs = [segs] ;
                  for (let seg of segs) {
                    let word = seg.seg ;
                    if (word) {
                     // console.log("match xml word " + word + " with json " + wlc +
                       //     ": " + JSON.stringify(wordList[wlc])) ;

                      seg.seg = {
                          "#text": "" + seg.seg, 
                          "@_c": scaleWhisperConfidenceScore(wordList[wlc++].score)
                        } ;
                      //console.log("WORD is " + JSON.stringify(seg)) ;
                    }            
                  }
                }
              }
            }
          }
          else {  // some transcripts dont have sp..  just straight into p
            console.log("No <sp> element") ;
      
            let paras = div2.p ;
            if (paras) {
              let ps = Array.isArray(paras) ? paras : [paras] ;
    
              for (let px of ps) {
                let segs = px.seg ;
                if (segs === undefined) continue ;
                if (!Array.isArray(segs)) segs = [segs] ;
                for (let seg of segs) {
                  let word = seg.seg ;
                  if (word) {
                    //console.log("match xml word " + word + " with json " + wlc +
                      //    ": " + JSON.stringify(wordList[wlc])) ;
                    seg.seg = {
                      "#text": "" + seg.seg,
                      "@_c": scaleWhisperConfidenceScore(wordList[wlc++].score)
                    } ;
                  }  
                }
              }
            }
          }
        } // session
        
        // OK, updated tei contents in teiWrapper - write to file

        let tempTEIfilename = "tmp-" + teiFilename ;
        console.log("tempTEIfilename=" + tempTEIfilename) ;

        const builder = new XMLBuilder({
          ignoreAttributes: false,
         // preserveOrder: true,
          attributeNamePrefix : "@_"
        }) ;

        const xmlContent = builder.build(teiWrapper) ;
        await fs.promises.writeFile(tempTEIfilename, xmlContent) ;
        return tempTEIfilename ;
      }
      catch(e) {
        console.log("error applying scores to tei:" + e) ;
        console.log(e.stack);
        return  fullDir + "/" + teiFilename ; // the orig filename, unchanged
      }                             
}

function scaleWhisperConfidenceScore(score) {

  if (isNaN(score)) return 0 ;
  if (score < 0) return 0 ;
  if (score >= 1) return 100 ;
  return Math.round(score * 100) ;
}


async function updateForm(req, res) {

  res.write("Not implemented") ;
  res.end() ;
  /*
  let id = req.query.id ;
  if (!id) res.write("id") ;

  try {
    console.log("updateForm id " + id ) ;
    res.render('update', {req: req, appConfig: appConfig, id: id}) ;
  }
  catch (err) {
    res.write("Error: " + err) ;
    console.log("updateForm err " + err) ;
    console.log(err.stack) ;
  }
  */
}


 
async function updatePost(req, res) {

  res.write("Not implemented") ;
  res.end() ;
/*
  let filename = req.body.filename ;
  if (!filename) {
    res.write("No filename") ;
    return ;
  }

  try {
    let doc = await docUtil.getDoc(filename) ;
    doc.set = set ;
    doc.docname = title ;
    console.log("updating doc set=" + set + "docname " + doc.docname) ;

    let xx= [] ; // for some unknown reason, about 1 in 10 docs get an error unless I do this - nothing obvious
    // and Java parses it just fine, wo dont know reason for this hack
    for (let k=0;k<768;k++) xx[k] = Number(doc.embedding[k]).toFixed(6) ;

    let mainDoc = [{
      filename: doc.filename,
      docname: doc.docname,
      comment: doc.comment,
      set: doc.set,
      loadedBy: doc.loadedBy,
      loadedDate: doc.loadedDate,
      summary: doc.summary,
      summaryStemmed: doc.summary,
      maxNonSummaryLevel: doc.maxNonSummaryLevel,
      embedding: xx // docSummary.embedding
    }] ;
    await solr.addOrReplaceDocuments(mainDoc, "fairyDocs") ;   
    
    
    // now, read all the fairyDocParts docs with matching filename, delete them then
    // re-store them with the updated set


    let selectData = 
    "wt=json&rows=9999" +
    "&q=filename:\"" + encodeURIComponent(doc.filename) + "\"" +
    "&fl=filename,level,seq,content,lowerLevelSourceStartSeq,lowerLevelSourceEndSeq,embedding" ;
  
    let solrRes = null ;
  
    //console.log("about to get " + appConfig.solr.getSolrBaseUrl() + "fairyDocParts/select?" + selectData) ;
    try {
      solrRes = await axios.get(
        appConfig.solr.getSolrBaseUrl() + "fairyDocParts/select?" + selectData) ;
    }
    catch (e) {
      console.log("Error solr reading parts in update " + e) ;
      if( e.response) console.log(e.response.data) ; 
      throw e ;
    }
  
    //console.log("createOutlines status: " + solrRes.status) ;
    if ((solrRes.status != 200) || !(solrRes.data && solrRes.data.response && solrRes.data.response.docs))
      throw "SOLR reading parts in update unexpected response: " + solrRes.status + " or nothing found" ;
  
    let partDocs = solrRes.data.response.docs ;

    console.log("parts read " + partDocs.length) ;

    // now delete parts before readding them

    await solr.deleteFilename(filename, "fairyDocParts") ;

    console.log("parts deleted") ;

    for (let part of partDocs) {
      part.set = doc.set ;
      let xx= [] ; // for some unknown reason, about 1 in 10 docs get an error unless I do this - nothing obvious
      // and Java parses it just fine, wo dont know reason for this hack
      for (let k=0;k<768;k++) xx[k] = Number(part.embedding[k]).toFixed(6) ;
      part.embedding = xx ;
    }

    await solr.addOrReplaceDocuments(partDocs, "fairyDocParts") ;
    console.log("Update re-added " + partDocs.length + " parts") ;

    res.render('updateDone', {req: req, appConfig: appConfig, filename: filename, title: doc.docname, set: set}) ;
  }
  catch (err) {
    res.write("Error: " + err) ;
    console.log("updatePost err " + err) ;
    console.log(err.stack) ;
  }
  */
}


async function uploadForm(req, res) {

  res.render('upload', {req: req, appConfig: appConfig}) ;
}

async function uploadPost(req, res) {
 
  console.log("in uploadPost..") ;
  const form = new formidable.IncomingForm({uploadDir: appConfig.relativeUploadDir, maxFiles:1});

  form.parse(req, async (err, fields, files) => {
    if (err) {
      next(err);
      return;
    }

    const comment = fields.comment ? fields.comment[0] : null ;
    const replace = fields.replace ? fields.replace[0] : 'y' ;
    const fileData = files["uploadedFile"][0] ;
 
    let errMsg = "" ;
    let successMsg = "" ;

    let audioId = "unknown" ;
    let mainDoc = null ;

    console.log("uploadPost fileData: " + JSON.stringify(uploadPost)) ;

    if (!fileData.originalFilename.startsWith("nla.obj-") || !fileData.originalFilename.endsWith("-tc.xml")) 
      errMsg = "file name must match nla.obj-OBJID-tc.xml and contain a TEI formatted transcript" ;

    if (!errMsg) {
      try {
        let stat = fs.statSync(appConfig.relativeTranscriptsDir + fileData.originalFilename) ;
        console.log("upload stat on " + appConfig.relativeTranscriptsDir + fileData.originalFilename + "\n" + JSON.stringify(stat) ) ;
        
        // temp
        fs.rmSync(appConfig.relativeTranscriptsDir + fileData.originalFilename) ;
        console.log("WARNING TEMP - deleted existing file in upload!") ;
        // SHOULD BE TODO: errMsg = "File already exists in AUDIO - it must first be deleted before it can be uploaded again" ;
      }
      catch (err) { 
        //console.log("stat err " + err) ;
      } // we dont want it to exist!
    }

    if (!errMsg) {
      try {
        fs.renameSync(fileData.filepath, appConfig.relativeTranscriptsDir + fileData.originalFilename) ;
      }
      catch (errRen) {
        errMsg = "Failed to rename " + fileData.filepath + " to " +
                 appConfig.relativeTranscriptsDir+ fileData.originalFilename +
                 " err: " + errRen ;
      }
    }

    console.log("errMsg:" + errMsg) ;
    if (!errMsg) {

      try {

        let fn = appConfig.relativeTranscriptsDir + fileData.originalFilename ;
    
        let ajs = await readTEIFileForJSON(fn) ;
        console.log("ajs metadata:\n" + JSON.stringify(ajs.metadata, null, 2)) ;

        console.log("ajs interviewId:\n" + JSON.stringify(ajs.interviewId, null, 2)) ;

        fs.writeFile ("/home/kfitch/audio2/tei.json", JSON.stringify(ajs), function(err) {
          if (err) throw err;
          console.log('Wrote json to /home/kfitch/audio2/tei.json');
        }) ;

        // store interview, sessions and parts then reindex every part

        //console.log("File contents:\n" + JSON.stringify(contents)) ;
 
        console.log(" interviewId " + ajs.interviewId + " sessions: " + ajs.sessions.length) ;

        let existingInterview = null ;
        try {
          let existingInterview = await interviewUtil.getInterview(ajs.interviewId) ; // throw if not loaded
          console.log(" Already loaded, replace=/" + replace + "/") ;
          /* DEBUG
          if ("n" == replace) {
            errMsg = "Id " + ajs.interviewId + " has already been loaded - not reload but yucko - file replaced HACK TODO" ;
            // hack sorry
            res.render('uploadDone', {req: req, appConfig: appConfig, id: ajs.interviewId, 
              successMsg: '', errMsg: errMsg}) ;
            console.log("NOT REPLACING") ;
            return ;
          }
          */
          console.log("WILL REPLACE") ;
          
        }
        catch (errx) {  // dont care - audio id not loaded yet  
          console.log(" NOT yet loaded") ;        
        }

        console.log("storing interview record " + ajs.interviewId) ;
        let interviewDoc = await interviewUtil.storeInterviewFromTEI(ajs, existingInterview) ;

        console.log("STORED interviewDoc:" + JSON.stringify(interviewDoc)) ;
        // build content for each session

        for (let session of ajs.sessions) {

          let contents = null ;

          if (session.transcript.chunks.length > 0) {
            
            let speakerLookup = [] ;      // optimise speakers for lookup
            for (let sp of session.speakers) speakerLookup["sp" + sp.id] = sp.name ;
            
            for (let chunk of session.transcript.chunks) {
              if (contents == null) contents = "" ;
              else contents += "\n\n" ;
              contents += speakerLookup["sp" + chunk.speaker] + ":" ;
              for (let c of chunk.content) 
                contents += " " + c.t ;            
            }
          }

          if (!contents || contents.length < 16) {
            console.log("Session " + session.sessionId + " has no or little content") ;
            if (!contents) contents = "No transcript content for this session." ;
          }
        
          console.log("Session " + session.sessionId + " contents length: " + contents.length) ;

          await interviewUtil.storeSessionAndQueueSummarisation(interviewDoc, session, contents) ;          
        }

        // after sessions are done, queue the interview

        console.log("QUEUING INTERVEW SUMMARY GENERATION ---") ;
        await interviewUtil.queueInterviewSummaryGeneration(interviewDoc) ; 


        /*
TODO - lets do these for each session and then generate the interview summary
        mainDoc = await interviewUtil.storeMainAudioDocAndQueueSummarisation(ajs, existingDoc, null, contents) ;
*/
        audioId = ajs.interviewId ;
        successMsg = "File successfully uploaded" ;           
      }  
      catch (errProc) {
        console.log("Error processing uploaded file: " + errProc) ;     
        console.log(errProc.stack) ;
        errMsg = "Error processing uploaded file: " + errProc ;        
      }
    }

    res.render('uploadDone', {req: req, appConfig: appConfig, 
                              file: fileData, id: audioId, 
                              title: (mainDoc) ? mainDoc.title : "", collection: (mainDoc) ? mainDoc.collection : "",
                              successMsg: successMsg, errMsg: errMsg}) ;

    if (!errMsg) {
      // ADD uploaded file to the cache ?? why is this here?
      try {
        let interview = await interviewUtil.getInterview(audioId) ;
        console.log("found interview " + interview.interviewId) ;
        //console.log("filename:" + req.query.filename + " doc:" + JSON.stringify(doc)) ;
      }
      catch (e) {
        console.log("Error in upload getDoc for " + audioId + ", err: " + e) ;
        console.log(e.stack) ;
        err = e ;
      }
    }
    console.log("UPLOAD DONE") ;
    
  });
}

async function readTEIFileForJSON(fn) {

  let i = fn.lastIndexOf("/") ; 
  if (i < 0) i = 0 ;
  let objId = fn.substring(i+1, fn.length - 6 - 1) ; // remove -tc.xml 

  let ajs = {
    interviewId: objId,
    metadata: {},
    sessions: [] 
  }
  //let lastSeg = {} ;// DEBUG
  try {
    let teiStr =  fs.readFileSync(fn, 'utf8').toString() ;
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix : "@_"
    }) ;

    const teiWrapper = parser.parse(teiStr) ;
    const tei = teiWrapper["TEI.2"] ;
   // console.log("read " + JSON.stringify(tei, null, 4)) ;
    const header = tei.teiHeader ;
    if (header) {
      const fileDesc = header.fileDesc ;
      if (fileDesc) {
        const titleStmt = fileDesc.titleStmt ;
        if (titleStmt) {
          let title = titleStmt.title ;
          if (title) {
            if (!Array.isArray(title)) title = [title] ; // rerun 11jan  was author = [title]
            ajs.metadata.title = [] ;
            for (let t of title) {
              ajs.metadata.title.push({
                type: t["@_type"],
                value: t["#text"],
                level: t["@_level"]
              }) ;
            }
          }
          let author = titleStmt.author ;
          if (author) {
            if (!Array.isArray(author)) author = [author] ;
            ajs.metadata.author = [] ;
            for (let a of author) {
              ajs.metadata.author.push(a.name) ;
            }
          }
          let sponsor = titleStmt.sponsor ;
          if (sponsor) {
            if (!Array.isArray(sponsor)) sponsor = [sponsor] ;
            ajs.metadata.sponsor = [] ;
            for (let s of sponsor) {
              ajs.metadata.sponsor.push(s["#text"]) ;
            }
          }   
          let resp = titleStmt.respStmt ;
          if (resp) {
            if (!Array.isArray(resp)) resp = [resp] ;
            ajs.metadata.responsibility = [] ;
            for (let r of resp) {
              ajs.metadata.responsibility.push({
                type: r["resp"],
                name: r["name"]
              }) ;
            }
          }
        }
        const publicationStmt = fileDesc.publicationStmt ;
        if (publicationStmt) {
          ajs.metadata.publisher = publicationStmt.publisher ;
          ajs.metadata.pubPlace = publicationStmt.pubPlace ;
          if (publicationStmt.date) {
            if (publicationStmt.date.dateRange) ajs.metadata.date = publicationStmt.date.dateRange["@_from"] ;
          }
        }
        const sourceDesc = fileDesc.sourceDesc ;
        if (sourceDesc)
          ajs.metadata.source = sourceDesc.bibl ;
      }
    }



    /* changed 29may24 - sp may repeat under div2 - before Id only ever seen one sp block...*/

// TODO 29may24 - div1 may be an array, so div1[n].div2 !!!  each div1 is a session
//<div1 id="nla.oh-7463-0000-0001_nla.obj-3252698472" n="1" type="Session">
//<div1 id="nla.oh-7463-0000-0002_nla.obj-3252698535" n="2" type="Session">
// etc, and may have a different <p><date>..</date></p> we should record at the (new) session level.  Those
// orig files I loaded only had 1 session.

    if (tei.text) {
      console.log("tei text") ;
      if (tei.text.body) {
        console.log("tei text body") ;
        if (tei.text.body.div1) {
          console.log("tei text body div1") ;
          if (tei.text.body.div1.div2) {
            console.log("tei text body div1 div2!!") ;
            
          }
          
        }
        
      }
    }
    // div1 are sessions.  If not an array, make it one..
    div1s =  (tei.text && tei.text.body && tei.text.body.div1) ? tei.text.body.div1 : null ;
    if (div1s == null) {
      console.log("No div1s - no sessions") ;
      return null ;
    }
    if (!Array.isArray(div1s)) div1s = [ div1s ] ; // turn into an array...

    for (let div1 of div1s) { // each session

      console.log("processing div1: " + JSON.stringify(div1).substring(0, 200) + " ...") ;

      if (!div1.div2) {
        console.log("No transcript for session " + div1["@_id"]) ;
        continue ;
      }
      let i =  div1["@_id"].indexOf("_") ; // "nla.oh-6134-0000-0001_nla.obj-219135352
      if (i <= 0) throw new Error("unexpected session ids from div1 id: " +  div1["@_id"]) ;

      let session = {
        seq: ajs.sessions.length,
        speakers: [],
        transcript: {chunks: []},
        history: []
      }
      session.deliveryObject =  div1["@_id"].substring(0, i) ;
      session.sessionId =  div1["@_id"].substring(i+1) ;

      ajs.sessions.push(session) ;

/*
<div1 id="nla.oh-0136-0000-0001_nla.obj-193368612" n="1" type="Session">
<p>
<date value="19680528">28 May 1968</date>
</p>
*/

      if (div1.p && div1.p.date) {
        session.yyyymmdd = div1.p.date["@_value"] ;
      }

      const div2 = div1.div2 ;

      console.log("div2 is " + div2)
      if (div2.sp) {  
        let sp = div2.sp ;
        if (!Array.isArray(sp)) sp = [ sp ] ; // turn into an array...
        console.log("*** 29may sp count is " + sp.length) ;

        for (let content of sp) {

          let speaker = content.speaker ;

          let si = -1 ;  // will default to unknown if no speaker provided
          if (speaker) {
            for (let sp of session.speakers) {
              if (sp.name == speaker) {
                si = sp.id ;
                break ;
              }
            }
            if (si < 0) { // not found - add new speaker
              si = session.speakers.length ;
              session.speakers.push({id:si, name:speaker}) ;
            }
          }
          else si = 0 ; // no speaker, default to 0

          let p = content.p ;
          console.log("*** 29mayCREATING CHUNK SPEAKER si " + si ) ;
          let chunk = {
            speaker: si,
            validated: 0,
            content: []
          }
          session.transcript.chunks.push(chunk) ;
          if (p) {
            let ps = Array.isArray(p) ? p : [p] ;
            for (let px of ps) {
              let segs = px.seg ;
              if (segs === undefined) continue ;
              if (!Array.isArray(segs)) segs = [segs] ;
              for (let seg of segs) {
               // console.log("seg: " + JSON.stringify(seg)) ;
                let from = seg.timeRange ? convertToCentiSecs(seg.timeRange["@_from"]) : 0 ; // 11jan
                let fto = seg.timeRange ? convertToCentiSecs(seg.timeRange["@_to"]) : from ; // 11jan
               // console.log("seg: " + JSON.stringify(seg)) ;

                let cc = {
                  s: from,
                  d: fto - from,
                  t: seg.seg["#text"]
                } ;
                if (seg.seg["@_c"]) cc.c = parseInt(seg.seg["@_c"]) ;

               // console.log("cc: " + JSON.stringify(cc)) ;
                chunk.content.push(cc) ;
              }
            }
          }
        }
      }
      else {  // some transcripts dont have sp..  just straight into p
        console.log("No <sp> element") ;
        let si = 0 ; // no speaker, default to 0
        let paras = div2.p ;
        if (paras) {
          let ps = Array.isArray(paras) ? paras : [paras] ;

          for (let px of ps) {
            let chunk = {
              speaker: si,
              validated: 0,
              content: []
            }
            session.transcript.chunks.push(chunk) ;
            let segs = px.seg ;
            if (segs === undefined) continue ;
            if (!Array.isArray(segs)) segs = [segs] ;
            for (let seg of segs) {
              // console.log("seg: " + JSON.stringify(seg)) ;
              let from = seg.timeRange ? convertToCentiSecs(seg.timeRange["@_from"]) : 0 ; // 11jan
              let fto = seg.timeRange ? convertToCentiSecs(seg.timeRange["@_to"]) : from ; // 11jan
              let cc = {
                s: from,
                d: fto - from,
                t: seg.seg["#text"]
              } ;
              if (seg.seg["@_c"]) cc.c = parseInt(seg.seg["@_c"]) ;
              chunk.content.push(cc) ;
            }
          }
        }
      }
      if (session.speakers.length == 0) session.speakers.push({id:0, name:"Unknown"}) ; // 15feb24 - force 1 speaker!
    } // session
    
  }
  catch (err) {
    console.log("readTEIFileForJSON err on " + fn + " err: " + err) ;
    console.log(err.stack) ;
    
    throw err ;
  }

  return ajs ;
}

function convertToCentiSecs(hhmmsscc) {
  let parts = hhmmsscc.split(':') ;
  return Number(parts[3]) + Number(parts[2]) * 100 + 
         Number(parts[1]) * 100 * 60 +  Number(parts[0]) * 100 * 60 * 60 ;
}







/*
async function OLD-when-text-was-a-string-processTextIntoChunks(text) {

  // preprocessing - remove long strings of dots

  text = text.replace(/\.\.\.+/gm, " ").replace(/__+/gm, " ")

  let paras = text.split("\n\n") ;  // first split on \n\n - these will be paras, and nice split places
  let chunks = [] ;
  let carryForward = null ;
  let carryForwardLen = 0 ;

  for (let p of paras) {
    p = p.replace(/[ \t][ \t]+/gm, " ").trim() ; // replace multi spaces or tabs with 1 space, trim

    let normP = p.replace(/\s\s+/gm, " ") ;
    let words = normP.split(/\s+/) ;

    //console.log("\nIN PARA carryForwardLen: " + carryForwardLen + " para words len " + words.length + "  starts: " + p.substring(0, 20)) ;
    if (carryForward) {
      if ((carryForwardLen + words.length) <= MAX_CHUNK_SIZE) {   // new and old fits
        carryForward = carryForward + "\n\n" + normP ;
        carryForwardLen += words.length ;
        continue ;
      }
      // new and old dont fit

      if (carryForwardLen >= MIN_CHUNK_SIZE) {
        chunks.push({text: carryForward, words: carryForwardLen}) ;
        //console.log("\n ***CHUNK ADDED FROM CARRYFORWARD starts " + carryForward.substring(0, 20)) ;
        carryForward = null ;
        carryForwardLen = 0 
      }
    }

    // carryforward may have existed, but it doesnt.  We just have current para to deal with.

    if (words.length <= MAX_CHUNK_SIZE) {
      if (words.length >= OK_CHUNK_SIZE) {  // good enough
        chunks.push({text: normP, words: words.length}) ;
        //console.log("\n *** CHUNK ADDED FROM goodenough len " + words.length + "\" starts " + normP.substring(0, 20)) ;
        continue ;
      }
      // quite small - move it to carryForward
      carryForward = normP ;
      carryForwardLen = words.length ;
      continue ;
    }

    // current para is too long.. split (maybe more than once!)

    //console.log("\n CURRENT PARA TOO LONG: " + words.length) ;

    while (words.length > MAX_CHUNK_SIZE) {
      // take leading words up to max chunk size, looking for a sentence
      let splitDone = false ;
      for (let i=MAX_CHUNK_SIZE;i>MIN_CHUNK_SIZE;i--) {
        if (words[i].endsWith(".")) {
          chunks.push({text: words.slice(0, i+1).join(" "), words: i}) ;  // put up to the sentence end in the chunks
          //console.log("\n ***CHUNK BY SPLIT ADDED " + i + " words  starting " + words.slice(0, i+1).join(" ").substring(0, 32)) ;
          words.splice(0, i+1) ;                          // and remove from words remaining to be chunked
          splitDone = true ;
          break ;
        }
      }
      //console.log("\n splitDone " + splitDone + " words Len" + words.length) ;

      if (splitDone) continue ; // made progress!
      // no progress - just plop in the MAX_CHUNKS
      chunks.push({text: words.slice(0, MAX_CHUNK_SIZE+1).join(" "), words:MAX_CHUNK_SIZE}) ;
      //console.log("\n ***CHUNK BY DESPARATE ADDED " + MAX_CHUNK_SIZE + " words  starting " + words.slice(0, MAX_CHUNK_SIZE).join(" ").substring(0, 32)) ;
      words.splice(0, MAX_CHUNK_SIZE+1) ;
      //console.log("    now words len left at " + words.length) ;
    }

    // OK, carry forward what's left

    carryForward = words.join(" ") ;
    carryForwardLen = words.length ;
    //console.log("\n CARRY FORWARD SET TO WORDS len=" + words.length) ;
  }

  if (carryForwardLen > 0) chunks.push({text: carryForward, words: carryForwardLen}) ;


  for (let chunk of chunks)     
    chunk.embedding = await util.getEmbedding(chunk.text) ; 

  return chunks ;
}
*/
module.exports.init = init ;