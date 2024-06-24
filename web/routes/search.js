const express = require('express') ;
const router = express.Router() ;
const log = require('log4js').getLogger('home') ;
const util = require('../util/utils') ;
const axios = require('axios') ;
const interviewUtil = require('../util/interview') ;

let appConfig = null ;
        
function init(appConfigParm) {

  appConfig = appConfigParm ;
  router.get('/',		              async (req, res) => { showSearchPage(req, res) }) ;
  router.get('/initSearch',		    async (req, res) => { initSearch(req, res) }) ;
  return router ;  
}

async function showSearchPage(req, res) {

  let stxt = '' ;
  let collection = "All" ;
  let id = "" ;
  let keywordScaling = 0.85 ;
  if (req.query) {
    if (req.query.stxt) stxt = req.query.stxt ;
    if (req.query.keywordScaling) keywordScaling = req.query.keywordScaling ;
    if (req.query.collection) collection = req.query.collection ;
    if (req.query.id) id = req.query.id ;// not used - could be used to restrict search to 1 transcript?
  }

  res.render('searchPage', {req: req, appConfig: appConfig, stxt: stxt, keywordScaling: keywordScaling, 
                            collectionSelect: util.getCollectionSelect(true, collection)
                     }) ;
}


async function getEmbedding(str) {

  let eRes = await axios.post(appConfig.embeddingURL, 
    { model:"Alibaba-NLP/gte-base-en-v1.5",
      input: [ str] // gte doesnt but bge requires this magic prefix ("Represent this sentence for searching relevant passages: ") to make embeddings best suited for retrieval similarity !?
    },
    { headers: {'Content-Type': 'application/json'}
    }  
  ) ;

  if (!eRes.status == 200) throw "Cant get embedding, embedding server returned http resp " + eRes.status ;
  if (!eRes.data || !eRes.data.data) throw "Cant get embedding, embedding server returned no data" ;
  return eRes.data.data[0].embedding ;
}

async function getHighlight(doc, question) {

  let query = "interviewId:" + doc.interviewId + " AND sessionId:" + doc.sessionId + " AND partId:" + doc.partId ;
  let selectData = "?wt=json&rows=1&q=" + encodeURIComponent(query) + // id:" + doc.id + 
    "&fl=id&hl.fl=content&hl.q=" + encodeURIComponent("content:(" + question + ")") +
    "&hl.requireFieldMatch=false&hl.snippets=3&hl.fragsize=50&hl=true&hl.tag.pre=<b><em>&hl.tag.post=</em></b>" ;

  console.log("getSnippet: " + appConfig.solr.getSolrBaseUrl() + "audio2SessionPart/select" + selectData) ;

  let solrRes = null ;

  try {    
    solrRes = await axios.get(appConfig.solr.getSolrBaseUrl() + "audio2SessionPart/select" + selectData) ;
  }
  catch (e) {
    console.log("Error solr chunk query " + e) ;
    if( e.response) console.log(e.response.data) ; 
    throw e ;
  }


  console.log("snippet status: " + solrRes.status) ;
  console.log("highlighting: " + JSON.stringify(solrRes.data.highlighting)) ;
  if ((solrRes.status == 200) && solrRes.data && solrRes.data.highlighting && 
          solrRes.data.highlighting[""] && solrRes.data.highlighting[""].content) {
    //console.log("id " + doc.id + " GOT HILITE " + JSON.stringify(solrRes.data.highlighting["" + doc.id])) ;
    let snippets = solrRes.data.highlighting[""].content ;
    //console.log("snippet1: " + JSON.stringify(snippets)) ;
    return snippets.join("... ") ;
  }
  throw "No snippets returned" ;
}

async function getSummary(doc, question) { 

    try {
      let highlights = await getHighlight(doc, question) ;
      // highlights = highlights.replaceAll("<em>", "").replaceAll("</em>", "").replaceAll(" ...", " ") ; // keep for list summary - maybe remove tags, ... ?
    //  console.log("id " + doc.id + " snippet: " + highlights) ;
      return highlights ;
    }
    catch (he) {
      console.log("Lucene hiliter, falling back to summary.  Failed id: " + doc.id + " q: " + question + " err: " + he)
      return null ;
    }
}

function innerProduct(v1, v2) {

  let r = 0 ;
  for (let i=0;i<v1.length;i++) r +=  v1[i] * v2[i] ;
  
  return r ;
}

async function initSearch(req, res) {

  console.log("in initsearch") ;
  let stxt = '' ;
  let collection = '' ;
  let id = '' ;
  let keywordScaling = 0.85 ;
  let facets = [] ;

  if (!req.query) {
    res.json({ok: false, error:"no search text"}) ;
    return ;
  }
  
  if (req.query.stxt) stxt = req.query.stxt ;
  if (req.query.keywordScaling) keywordScaling = req.query.keywordScaling ;

  if (req.query.id) id = req.query.id ; // mutually exclusive with collection (later) but not used yet
  if (req.query.collection) collection = req.query.collection ;  

  if (req.query.facet) {
    let t = req.query.facet ;
    if (!Array.isArray(t)) t = [t] ;
    for (let f of t) {
      let i = f.indexOf(':') ;
      if (i > 0) facets.push({fn: f.substring(0, i), fv: decodeURIComponent(f.substring(i+1))}) ;
    }
  }

  let origQuestion = stxt ;

  stxt = cleanseLite(stxt).trim() ;
  if (stxt.length < 1) {
    stxt = "*" ;
  }

  let qVec = await getEmbedding(stxt) ;
  //console.log("qVec len " + qVec.length) ;

  let query = "({!knn f=embedding topK=50}" + JSON.stringify(qVec) + ")^" + keywordScaling + 
              " OR (" +

// title starts with  TODO - index words?               
                 "title:(" + stxt.replaceAll(" ", "*") + "*)^2 OR " +

// session level transcript ((*only* partType S)
                "sessionTranscriptStemmed:(" + stxt + ")^0.1 OR " +
                "sessionTranscript:(" + stxt + ")^0.3 OR " +
                "sessionTranscriptStemmed:\"" + stxt + "\"~5^0.3 OR  " +
                "sessionTranscript:\"" + stxt + "\"~5^0.9 " +

// summaries and transcript chunks              
                "contentStemmed:(" + stxt + ")^0.1 OR " +
                "content:(" + stxt + ")^0.3 OR " +
                "contentStemmed:\"" + stxt + "\"~5^0.3 OR  " +
                "content:\"" + stxt + "\"~5^0.9 " +
              ")^" + (( 1 - keywordScaling) / 2) ;

  //console.log("SET " + set + " filename " + filename) ;

  if (id  && (id != "All"))  
      query += "&fq=id:\"" + id + "\"" ;
  else if (collection && (collection != "All"))  query += "&fq=collection:\"" + collection + "\"" ;
  // 5feb - what if we dont?        query += "&fq=level:0" ;  // only searches the bottom/shortest fragments!  no "all text" search yet..

  let selectData = 
    "&wt=json&rows=100" +
    "&q=" + query + 
    "&q.op=AND" +
    //"&facet=true&facet.field=set&facet.field=filename" +
    "&group.field=interviewId&group.limit=5&group=true" +
    "&fl=interviewId,sessionId,sessionSeq,partType,partId,collection,content,sessionTranscript,startcs,endcs,embedding,score" ; // rm embedding

  console.log("ssearch query part: " + selectData.replace(/\[[^\]]*/, "[]..vectors..]")  + "\nurl: " + 
                appConfig.solr.getSolrBaseUrl() + "audio2SessionPart/select") ;
  let solrRes = null ;
  
  try {
    solrRes = await axios.post(
      appConfig.solr.getSolrBaseUrl() + "audio2SessionPart/select",
      selectData) ;
  }
  catch (e) {
    console.log("Error solr query " + e) ;
    if( e.response) console.log(e.response.data) ; 
    return ;
  }

  console.log("search status: " + solrRes.status) ;
  
  if ((solrRes.status == 200) && solrRes.data && solrRes.data.grouped) {

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Transfer-Encoding': 'chunked'
    }) ;

    console.log("grouped" + JSON.stringify(solrRes.data.grouped).substring(0, 400)) ;

    console.log(" SEARCH FOUND " +solrRes.data.grouped.interviewId.matches + " DOCS");

    // only show/keep top 20 groups
    let groups = solrRes.data.grouped.interviewId.groups.splice(0, 20) ;  

    let resultOutline = [] ;

    for (let group of groups) {
      let id = group.groupValue ;
      group.promiseToGetIndexToLowerContentForInterview = interviewUtil.getIndexToLowerContentForInterview(id) ; // async..

      let interview = await interviewUtil.getBasicInterview(id) ; // getInterview(id) ;
      console.log("\n\n GROUP " + id + " max score " + group.doclist.maxScore) ;
      let docs = group.doclist.docs ;
      let thresholdScore =  group.doclist.maxScore * 0.5 ; 
      let acceptedDocs = [] ;
      let maxSimilarityScore = 0 ;
      let maxSimId = "" ;
      //let xx = '' ;

      let summaryDocs = [] ;

      for (let doc of docs) {
        console.log("DOC interview " + doc.interviewId +  " session " + doc.sessionId + " / " + doc.partId + 
        " start-endcs:" + doc.startcs + "-" + doc.endcs + " score " + doc.score) ;
        if (doc.partType == 'I') continue ; // ignore interview summaries
        if (doc.score < thresholdScore) {
          console.log("  doc REJECTED, score: " + doc.score)
          continue ;
        }
        if (doc.content)  doc.bytes = doc.content.length ;
        doc.similarity = innerProduct(doc.embedding, qVec) ;
        if (doc.similarity > maxSimilarityScore) {
          maxSimilarityScore = doc.similarity ;
          maxSimId = doc.sessionId + " / " +  doc.partId ;
          //xx = doc.content ;
        }
        delete doc.embedding ; // dont want to send this to the client!
        // not yet = maybe rejected 7jun24 doc.highlight = await getSummary(doc, stxt) ;

        acceptedDocs.push(doc) ;
        if (doc.partType != 'T')   // a summary - remember the range so we can remove non-summaries covered by this summary range
          summaryDocs.push(doc) ;
        
        //console.log("  doc " +  JSON.stringify(doc).replace(/embedding\"\:\[.*\]/, "[]..vectors..]")) ;
      }
      // 5feb24 - remove any covered by summaries
      if (summaryDocs) {

        for (let doc of acceptedDocs) {
          let covered = false ;
          for (summaryDoc of summaryDocs) {
            if (summaryDoc == doc) continue ; // cant eliminate itself!
            if ((doc.sessionId == summaryDoc.sessionId) && (doc.startcs >= summaryDoc.startcs) && (doc.endcs <= summaryDoc.endcs)) { // times entirely within summary
              if ((doc.partType == 'T') || ((doc.partType != 'T') && (doc.partId.length > summaryDoc.partId.length))) { // lowest level or lower level summary
                covered = true ;
                doc.covered = true ;
                console.log("  XX Summary eliminated " + "DOC " + doc.sessionId +  " / " + doc.partId +  
                " start-endcs:" + doc.startcs + "-" + doc.endcs + " score " + doc.score) ;
                break ;
              }
            }
          }
        }
      }

      let goodDocs = [] ;
      for (let doc of acceptedDocs) {
        if (doc.covered) continue ;
        //console.log(" ACCEPTED " + JSON.stringify(doc)) ;
        //console.log(" ACCEPTED "+ doc.sessionId +  " / " + doc.partId +  
          //      " start-endcs:" + doc.startcs + "-" + doc.endcs + " score " + doc.score) ;
        doc.highlight = await getSummary(doc, stxt) ;
        console.log("Got highlight:" + doc.highlight) ;
        goodDocs.push(doc) ;
      }

      for (let t of goodDocs) console.log("GOOD DOC " + t.interviewId + " highlight " + t.highlight) ;
      
      /* sort accepted docs by seq

      //console.log("best content seq = " + maxSimSeq + " content " + xx) ;
      acceptedDocs.sort(function(a, b) {
        return a.seq - b.seq ;
      }) ;
      //for (let doc of acceptedDocs)
      //  console.log("\n  doc " +  JSON.stringify(doc).replace(/embedding\"\:\[.*\]/, "[]..vectors..]")) ;

      // ask the LLM..
      */

      group.acceptedDocs = goodDocs ; //acceptedDocs ;

      let indexToLowerContent = await group.promiseToGetIndexToLowerContentForInterview ; // waiting for that async req to finish
      
      resultOutline.push({
        docs: group.acceptedDocs,
        interviewId: id,
        title: interview.title,
        collection: interview.collection,
        summary: interview.summary,
        year: interview.year,
        score: group.doclist.maxScore,
        similarityScore: maxSimilarityScore,
        maxSimId: maxSimId,
        indexToLowerContent: indexToLowerContent
      }) ;
    }
    
    res.write(JSON.stringify({ok: true, type: "resultOutline", resultOutline}) + "\n") ;

/*
    for (let gs=0;gs<groups.length;gs++) {       
      let group = groups[gs] ;   
      let summary = await getSummaryForGroup(group.groupValue, group.acceptedDocs, origQuestion, gs) ;
      //console.log("\n=========\n==========Summary " + JSON.stringify(summary) + "\n") ;
      res.write(JSON.stringify({ok: true, type: "summary", summary}) + "\n") ;
    }
    */
  }
  else {
    console.log("Dud search result ") ;
    res.write(JSON.stringify({ok: false, type: "error", err: "Dud search result"}) + "\n") ;
  }
  res.end("\n") ;
}



function cleanseLite(parm) {

	if (typeof(parm) === 'string') return parm.replace(/[^-A-Za-z0-9 '():]/g, " ") ;
	return "" ;
}

function cleanseVeryLite(parm) {

	if (typeof(parm) === 'string') return parm.replace(/[^-A-Za-z0-9 .,\!\?'():;\n]/g, " ") ;
	return "" ;
}

module.exports.init = init ;