const path = require('path') ;

const https = require("https") ;
const fs = require("fs") ;

const express = require('express') ;
const helmet = require('helmet') ;
const bodyParser = require('body-parser') ;
const cookieParser = require('cookie-parser') ;
const httpErrors = require('http-errors') ;
const axios = require('axios') ;
const morgan = require('morgan') ;
const log4js = require('log4js') ;
const rfs = require('rotating-file-stream') ;

require('dotenv').config() ;                            // reads .env, sets up process.ENV props

const app = express() ;
app.use(helmet()) ;
app.use(bodyParser.json({limit: '1mb'})) ;
app.use(bodyParser.urlencoded({limit: '10mb', extended: true, parameterLimit:50000})) ;
app.use(cookieParser()) ;


//  -----  logging  -----

const morganLogStream = rfs.createStream("access.log", {		// morgan output file
	interval: "1d", 						// new log each day
	compress: true,             // was "gzip",  but it did nothing...
	path: path.join(__dirname, "logs")
}) ;

app.use(morgan("combined", { stream: morganLogStream })) ;

log4js.configure({
	appenders: {
		everything: {
			type: 'dateFile',
			filename: path.join(__dirname, "logs", "output.log"),
			compress: true
		}
	},
	categories: {
		default: {
			appenders: ['everything'],
			level: 'warn'
		}
	}
}) ;

const log = log4js.getLogger() ;

//  ----- config object passed to routers  -----

const appConfig = {
	port: process.env.PORT,
	urlPrefix: process.env.URL_PREFIX,
	embeddingURL: process.env.EMBEDDING_URL,
	summaryURL: process.env.SUMMARY_URL,
	inferenceEngine: process.env.INFERENCE_ENGINE,
	relativeUploadDir: process.env.RELATIVE_UPLOAD_DIR,
	relativeTranscriptsDir: process.env.RELATIVE_TRANSCRIPTS_DIR,
	audioInterviewCore: process.env.SOLR_AUDIO_INTERVIEW_CORE,
	audioSessionCore: process.env.SOLR_AUDIO_SESSION_CORE,
	audioSessionPartCore: process.env.SOLR_AUDIO_SESSION_PARTCORE,	
	audioReindexQueueCore: process.env.SOLR_AUDIOREINDEXQUEUE_CORE
} ;


//  -----  util setup  -----

const util = require('./util/utils') ;
util.init(appConfig) ;
appConfig.util = util ;

//  -----  solr setup  -----

const solr = require('./util/solr') ;
solr.init(appConfig) ;
appConfig.solr = solr ;

//  -----  interview utils setup  -----


const interviewUtil = require('./util/interview') ;
interviewUtil.init(appConfig) ;
appConfig.interviewUtil = interviewUtil ;


//  -----  static requests handled by express from /static  -----

app.use(appConfig.urlPrefix + '/static', express.static(path.join(__dirname, 'static'))) ;

//  -----  ejs config  -----
  
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

//  ----- general routes

app.use(appConfig.urlPrefix + '/',        require('./routes/home')		.init(appConfig)) ;
app.use(appConfig.urlPrefix + '/search',  require('./routes/search')	.init(appConfig)) ;
app.use(appConfig.urlPrefix + '/upload',  require('./routes/upload')	.init(appConfig)) ;
app.use(appConfig.urlPrefix + '/doc', 	  require('./routes/doc')			.init(appConfig)) ;
app.use(appConfig.urlPrefix + '/listen',  require('./routes/listen')	.init(appConfig)) ;
// TODO app.use(appConfig.urlPrefix + '/correct', require('./routes/correct')	.init(appConfig)) ;

app.use(appConfig.urlPrefix + '/chat', 		require('./routes/chat')		.init(appConfig)) ; // bogus generic chat

//  -----  errors  -----

app.use(function(req, res, next) {                              // forward 404 to error handler
  next(httpErrors(404)) ;
});

app.use(function(err, req, res, next) {                 // error handler
  // set locals, only providing error in development
  res.locals.message = err.message ;
  res.locals.errStatus = err.status ;
  res.locals.error = req.app.get('env') === 'dev' ? err : {};

  log.info("Error " + err.status + " / " + err.message + " req: " +req.url + " params: " + JSON.stringify(req.params)) ;
  res.status(err.status || 500) ;
  res.render('error', {req: req}) ;
});


log.info("url prefix:    " + appConfig.urlPrefix) ;
log.info("About to start server on port " + appConfig.port) ;

//  -----  start server  -----

https
  .createServer(
		{
			key: fs.readFileSync("key.pem"),
			cert: fs.readFileSync("cert.pem"),
		},
		app)
  .listen(appConfig.port, () =>
		{
    	console.log(`server is running at port ${appConfig.port} with key/cert`) ;
  	}
	) ;

	// now initiate running interviewUtil.findAudioToSummarise forever

	async function scanReindexQueue() {

		let anyFound = false ;
		try {
			anyFound = await interviewUtil.findAudioToSummarise() ;
		}
		catch(err) {
			console.log("scanReindexQueue err " + err) ;
      console.log(err.stack) ;
		}		

		setTimeout(scanReindexQueue, (anyFound) ? 10 : 30000) ;	// if any found to reindex, check again soon, else long sleep
	}

  // initiated on startup, then runs to completion (empties queue) then sleeps 30sec
	// DEBUG suspend 
	setTimeout(scanReindexQueue, 1000) ;

