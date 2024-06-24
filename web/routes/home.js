const express = require('express') ;
const router = express.Router() ;
const log = require('log4js').getLogger('home') ;
const util = require('../util/utils') ;
const solr = require('../util/solr') ;


let appConfig = null ;
        
function init(appConfigParm) {

  appConfig = appConfigParm ;
  router.get('/',		    async (req, res) => { index(req, res) }) ;
  return router ;  
}

async function index(req, res) {

  let stxt = '' ;
  let collection = "All" ;
  let id = "" ;
  let keywordScaling = 0.85 ;
  if (req.query) {
    if (req.query.stxt) stxt = req.query.stxt ;
    if (req.query.keywordScaling) keywordScaling = req.query.keywordScaling ;
    if (req.query.collection) collection = req.query.collection ;
    if (req.query.id) id = req.query.id ;
  }

  let err = null ;

  res.render('home', {req: req, appConfig: appConfig, stxt: stxt, keywordScaling: keywordScaling, 
                      collectionSelect: util.getCollectionSelect(true, collection), 
                      err:err}) ;
}

module.exports.init = init ;