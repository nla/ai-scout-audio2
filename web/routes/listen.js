const express = require('express') ;
const router = express.Router() ;
const log = require('log4js').getLogger('home') ;
const util = require('../util/utils') ;
const https = require('https') ;

let appConfig = null ;
        
function init(appConfigParm) {

  appConfig = appConfigParm ;
  router.get('/*',		    async (req, res) => { proxy(req, res) }) ;
  return router ;  
}

async function proxy(req, res) {    // simple audio proxy to avoid eula

  // we expect the url to be /listen/nla.obj-nnnn and to have a Range header
  /*
  curl 'https://nladom-test.nla.gov.au/tarkine/listen/download/nla.obj-222465061?copyRole=l2' 
  -H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.13; rv:63.0) Gecko/20100101 Firefox/63.0'
  -H 'Accept: audio/webm,audio/ogg,audio/wav,audio/*;q=0.9,application/ogg;q=0.7,video/*;q=0.6,*\/*;q=0.5' <--- note \ inserted to not end comment!
  -H 'Accept-Language: en-US,en;q=0.5' -H 'Referer: https://nladom-test.nla.gov.au/' 
  -H 'Range: bytes=45514752-45515751' 
  -H 'DNT: 1' -H 'Connection: keep-alive' 
  -H 'Cookie: amadeula=nla.obj-222465061%2C' 
  -H 'Sec-Fetch-Dest: audio' -H 'Sec-Fetch-Mode: no-cors' -H 'Sec-Fetch-Site: same-origin' 
  -H 'Sec-GPC: 1' -H 'Accept-Encoding: identity' -H 'TE: trailers' --output x9a
  */

  try {
    console.log('proxy: ' + req.url) ;
    let i = req.url.lastIndexOf('/') ;
    let nlaObj = req.url.substring(i+1) ;

    let x = req.headers ;
    delete x.host ;
    delete x.cookie ;

    const options = {
      hostname: 'nla.gov.au',
      //hostname: 'nladom-test.nla.gov.au',
      port: 443,
      path: '/tarkine/listen/download/' + nlaObj + '?copyRole=l2',
      method: req.method,
      headers: {
        ...req.headers,
        'cookie': 'amadeula=' + nlaObj + '%2C',
        'referer': 'https://nladom-test.nla.gov.au/'
      }
    } ;

    console.log("proxy set OPTIONS=" + JSON.stringify(options)) ;

    const proxy = https.request(options, function (r) {
      console.log("PROXY RET statusCode " + r.statusCode + " msg " + r.statusMessage + " headers " + JSON.stringify(r.headers)) ;
      res.writeHead(r.statusCode, r.headers);
      r.pipe(res, {
        end: true
      });
    });

    req.pipe(proxy, {
      end: true
    });
  }
  catch (err) {
    console.log("proxy failed " + err) ;
    console.log(err.stack) ;
    res.write("failed") ;
    res.end() ;
  }
}

module.exports.init = init ;