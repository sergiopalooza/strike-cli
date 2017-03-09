#!/usr/bin/env node
var fs = require('fs');
var http = require('https');
var prompt = require('prompt');
var jsforce = require('jsforce');
var chalk = require('chalk');
var figlet = require('figlet');
var clear = require('clear');
var low = require('lowdb');
var db = low('db.json');
var async = require('async');

const REPO_BASE_URL = "https://raw.githubusercontent.com/appiphony/Strike-Components/master/aura";
const STATIC_RESOURCE_URL = "https://raw.githubusercontent.com/appiphony/Strike-Components/master/staticresources";

var isDev = true;

var fileExtensionMap = {
		COMPONENT: '.cmp',
		CONTROLLER: 'Controller.js',
		HELPER: 'Helper.js',
		RENDERER: 'Renderer.js',
		EVENT: '.evt',
		RESOURCE: '.resource',
		STYLE: '.css',
		TOKENS: '.tokens'
	};

var fileFormatMap = {
		COMPONENT: 'XML',
		CONTROLLER: 'JS',
		HELPER: 'JS',
		RENDERER: 'JS',
		EVENT: 'XML',
		TOKENS: 'XML',
		STYLE: 'CSS'
	};

var dependencyMap = { //we will have to download this from the repo eventually
	strike_tooltip: ['strike_tooltip'],
	strike_badge: ['strike_badge'],
	strike_chart: ['strike_chart'],
	strike_modal: ['strike_evt_modalPrimaryButtonClicked', 'strike_evt_modalHidden', 'strike_evt_modalHide', 'strike_evt_modalShown', 'strike_evt_modalShow', 'strike_modal'],
  	strike_textarea: ['strike_textarea'],
  	strike_select: ['strike_tooltip', 'defaultTokens', 'svg', 'strike_evt_notifyParent', 'strike_select'],
  	strike_datepicker: ['defaultTokens', 'strike_datepicker'],
  	strike_multiSelectPicklist: ['defaultTokens', 'strike_evt_notifyParent', 'strike_evt_componentDestroyed', 'strike_tooltip', 'strike_multiSelectPicklist']
};

var conn = new jsforce.Connection();

if(resetFlagExists()){
	fs.unlinkSync(process.cwd() + "/db.json");
	console.log('Configuration file reset');
} else {
	intializeDatabase();
	drawScreen();
	createStrikeComponentFolder();
	prompt.start();
	async.waterfall([
		downloadTargetComponents,
		getUserInput,
		login,
		queryForExistingBundle,
	], function(err, result){
		async.waterfall([
			function upsertComponentFiles(callback){
				if (bundleExists(result.queryResult)){
					var bundleId = result.queryResult.records[0].Id;
					updateComponentFiles(bundleId, ['COMPONENT', 'CONTROLLER', 'HELPER', 'RENDERER'], function(){
						callback(null);
					});
				} else {
					var bundlesToCreate = dependencyMap[process.argv[2]];
					console.log('before creating a bundle');
					async.eachSeries(bundlesToCreate, function(bundle, callback){
						var tmpBundleInfo = {
							name: bundle, // my description
	  						description: 'I was created from Strike-CLI'
						};

						if(requiresD3(bundle)){
							createStaticResource('d3');
						}

						createAuraDefinitionBundle(tmpBundleInfo, function(){
							callback(null);
						});						
					}, function(err){
						if(err) {
					      // One of the iterations produced an error.
					      // All processing will now stop.
					      console.log('A file failed to process');
					      callback(null);
					    } else {
					      console.log('All files have been processed successfully');
					      callback(null);
					    }
					})
				}
			}
		], function deleteStrikeComponentFolder(err, result){
			deleteFolderRecursive(process.cwd() + "/strike-components");
		});
	});
}



function getUserInput(callback){
	log('we are in getUserInput');
	prompt.get(configurePromptSchema(), function (err, res){
		if (err) { return console.error(chalk.red(err)); }
		var userInput = createUserInputObj(res);
		callback(null, userInput);
	});	
}

function login(userInput, callback){
	log('we are logging in');
	conn.login(userInput.username, userInput.password, function(err, res) {
		if (err) { return console.error(chalk.red(err)); }
		saveUserInput(userInput.username, userInput.password); //comment this if you dont want to capture credentials
		callback(null, userInput);
	});
}

function queryForExistingBundle(userInput, callback){
	conn.tooling.query("Select Id, DeveloperName FROM AuraDefinitionBundle WHERE DeveloperName ='" + userInput.bundleInfo.name + "'", function(err, res){
		if (err) { return console.error(chalk.red(err)); }
		callback(null, {queryResult: res, userInput: userInput});
	});
}

function requiresD3(bundle){
	
	return bundle === 'strike_chart';
}

function resetFlagExists() {

	return process.argv[2] == 'reset' || process.argv[2] == '-r';
}

function intializeDatabase (){
	db.defaults({ credentials: []})
		.value();	
}

function drawScreen(){
	clear();
	console.log(
	  chalk.cyan(
	    figlet.textSync('Strike-CLI', { horizontalLayout: 'full' })
	  )
	);
}

function createStrikeComponentFolder(){
	deleteFolderRecursive(process.cwd() + "/strike-components"); //uncomment if you want to create the folder everytime
	fs.existsSync(process.cwd() + "/strike-components") || fs.mkdirSync(process.cwd() + "/strike-components");	
}

function downloadTargetComponents(callback, targetComponents){
	log('we are downloading components');
	if(dependencyMap.hasOwnProperty(process.argv[2])){
		var targetComponents = dependencyMap[process.argv[2]];

		targetComponents.forEach(function(componentName){
			downloadComponentBundle(componentName);
		});
		
		callback(null);
	} else {
		console.log('Sorry, this is not a supported component');
	}
}

function downloadComponentBundle(componentName){
	fs.mkdirSync(process.cwd() + "/strike-components/" + componentName);

	if(requiresD3(componentName)){
		downloadFile('d3', 'RESOURCE');
	}

	downloadFile(componentName, 'COMPONENT');
	downloadFile(componentName, 'CONTROLLER');
	downloadFile(componentName, 'HELPER');
	downloadFile(componentName, 'RENDERER');
	downloadFile(componentName, 'EVENT');
	downloadFile(componentName, 'STYLE');
	downloadFile(componentName, 'TOKENS');
}

function downloadFile(fileName, fileExtension){
	var fileSource;
	var fileDestination;

	if(fileExtension === 'RESOURCE'){
		fileSource = STATIC_RESOURCE_URL + "/" + fileName + fileExtensionMap[fileExtension];
		fileDestination = fs.createWriteStream(process.cwd() + "/strike-components/" + fileName + fileExtensionMap[fileExtension], {flags: 'w', mode: 0755});
	} else {
		fileSource = REPO_BASE_URL + "/" + fileName + "/" + fileName + fileExtensionMap[fileExtension]
		fileDestination = fs.createWriteStream(process.cwd() + "/strike-components/" + fileName + "/" + fileName + fileExtensionMap[fileExtension], {flags: 'w', mode: 0755});
	}

	async.waterfall([
		function requestFile(callback){
			// console.log('downloading from url: ' + fileSource); 
				http.get(fileSource, function(response) {
				callback(null, response);
			});
		},
		function writeResponseToFile(response, callback){
			// console.log('saving the response');
			response.pipe(fileDestination);
			var body = '';
			
			response.on('data', function(d){
				body += d;
			});

			response.on('end', function(){
				callback(null, body)
			});
		}
	], function(err, result){
		if (err) { return console.error(chalk.red(err)); }
	});
}

function validContent(body){
	return body != '404: Not Found\n'
}

function doesComponentFolderExist(){

	return fs.existsSync(process.cwd() + "/strike-components"); 
}

function configurePromptSchema(){
	if(!credentialsExist()){
		prompt.message = 'Strike-CLI';
		var promptSchema = {
			properties: {
				username: {
					description: 'Username'
				},
				password: {
					description: 'Password',
					hidden: true
				}
			}
		};
		return promptSchema;
	} else {
		return {properties:{}};	//will not prompt user for any questions
	}
}

function credentialsExist(){

	return db.get('credentials').find({ id: 1 }).value() != undefined
}

function createUserInputObj(promptResponse){
	var userInputObj = {
		username: promptResponse.username || db.get('credentials').find({ id: 1 }).value().username,
		password: promptResponse.password || db.get('credentials').find({ id: 1 }).value().password,
		bundleInfo: {
			name: promptResponse.componentName || process.argv[2],
			description: promptResponse.inputDescription || 'I was created from Strike-CLI'
		}
	};
	return userInputObj;
}

function saveUserInput(username, password){
	db.get('credentials')
		.push({ id: 1, username: username, password: password})
		.value();	
}

function deleteFolderRecursive(path) {
    var files = [];
    if( fs.existsSync(path) ) {
        files = fs.readdirSync(path);
        files.forEach(function(file,index){
            var curPath = path + "/" + file;
            if(fs.lstatSync(curPath).isDirectory()) { // recurse
                deleteFolderRecursive(curPath);
            } else { // delete file
                fs.unlinkSync(curPath);
                console.log('deleted ' + curPath);
            }
        });
        fs.rmdirSync(path);
    }
}

function bundleExists(response){

	return response.records.length > 0;
}

function upsertFiles(bundleId, inputArgs, callback){
	if(isEvent(inputArgs.name)){
		upsertComponentFile(bundleId, inputArgs, 'EVENT');	
	} else if(isToken(inputArgs.name)){
		upsertComponentFile(bundleId, inputArgs, 'TOKENS')
	} else{
		upsertComponentFile(bundleId, inputArgs, 'COMPONENT');
		upsertComponentFile(bundleId, inputArgs, 'CONTROLLER');
		upsertComponentFile(bundleId, inputArgs, 'HELPER');
		upsertComponentFile(bundleId, inputArgs, 'RENDERER');
		upsertComponentFile(bundleId, inputArgs, 'STYLE');
	}
	
	callback();
}

function createAuraDefinitionBundle(inputArgs, callback){
	conn.tooling.sobject('AuraDefinitionBundle').create({
		Description: inputArgs.description, // my description
	  	DeveloperName: inputArgs.name,
	  	MasterLabel: inputArgs.name, 
	  	ApiVersion:'36.0'
	}, 	function(err, res){
		
		// if (err) {
		// 	if(err.errorCode === 'DUPLICATE_DEVELOPER_NAME'){
		// 		console.log('query for ID and update');
		// 		var tempObj = {
		// 			bundleInfo: inputArgs
		// 		};

		// 		conn.tooling.query("Select Id, DeveloperName FROM AuraDefinitionBundle WHERE DeveloperName ='" + inputArgs.name + "'", function(err, res){
		// 				if (err) { return console.error(chalk.red(err)); }
		// 				console.log('in query response');
		// 				console.log(res);
		// 			});
		// 	} else {
		// 		console.log(err.errorCode);
		// 		console.log(typeof(err));
		// 		return console.error(err);
		// 	}
		// }
		var bundleId;

		if(err){
			if(err.errorCode === 'DUPLICATE_DEVELOPER_NAME'){
				conn.tooling.query("Select Id, DeveloperName FROM AuraDefinitionBundle WHERE DeveloperName ='" + inputArgs.name + "'", function(err, res){
					if (err) { return console.error(chalk.red(err)); }
					console.log(res.records[0].DeveloperName + ' bundle already exists');
					bundleId = res.records[0].Id;

					upsertFiles(bundleId, inputArgs, function(){
						log('upsertFiles Ran');
						callback();
					});
				});
			} else{
				{ return console.error(chalk.red(err)); }
			}
		} else{
			bundleId = res.id;

			upsertFiles(bundleId, inputArgs, function(){
				log('upsertFiles Ran');
				callback();
			});
		}

		
		


		// if(isEvent(inputArgs.name)){
		// 	upsertComponentFile(bundleId, inputArgs, 'EVENT');	
		// } else if(isToken(inputArgs.name)){
		// 	upsertComponentFile(bundleId, inputArgs, 'TOKENS')
		// } else{
		// 	upsertComponentFile(bundleId, inputArgs, 'COMPONENT');
		// 	upsertComponentFile(bundleId, inputArgs, 'CONTROLLER');
		// 	upsertComponentFile(bundleId, inputArgs, 'HELPER');
		// 	upsertComponentFile(bundleId, inputArgs, 'RENDERER');
		// 	upsertComponentFile(bundleId, inputArgs, 'STYLE');
		// }
		
		// callback();






		// if (err) {
		// 	if(err.errorCode === 'DUPLICATE_DEVELOPER_NAME'){
		// 		conn.tooling.query("Select Id, DeveloperName FROM AuraDefinitionBundle WHERE DeveloperName ='" + inputArgs.name + "'", function(err, res){
		// 			if (err) { return console.error(chalk.red(err)); }
		// 			var bundleId = res.records[0].Id;
		// 			console.log('in bundle query response');
		// 			console.log(res.records[0].DeveloperName + ' bundle already exists');

		// 			if(isEvent(inputArgs.name)){
		// 				upsertComponentFile(bundleId, inputArgs, 'EVENT');	
		// 			} else if(isToken(inputArgs.name)){
		// 				upsertComponentFile(bundleId, inputArgs, 'TOKENS')
		// 			} else{
		// 				upsertComponentFile(bundleId, inputArgs, 'COMPONENT');
		// 				upsertComponentFile(bundleId, inputArgs, 'CONTROLLER');
		// 				upsertComponentFile(bundleId, inputArgs, 'HELPER');
		// 				upsertComponentFile(bundleId, inputArgs, 'RENDERER');
		// 				upsertComponentFile(bundleId, inputArgs, 'STYLE');
		// 			}
					
		// 			callback();
		// 		});
		// 	} else {
		// 		return console.error(err);
		// 	}
		// } else {
		// 	console.log(inputArgs.name + ' Bundle has been created');
		// 	console.log(res);

		// 	var bundleId = res.id;

		// 	if(isEvent(inputArgs.name)){
		// 		createComponentFile(bundleId, inputArgs, 'EVENT');	
		// 	} else if(isToken(inputArgs.name)){
		// 		createComponentFile(bundleId, inputArgs, 'TOKENS')
		// 	} else{
		// 		createComponentFile(bundleId, inputArgs, 'COMPONENT');
		// 		createComponentFile(bundleId, inputArgs, 'CONTROLLER');
		// 		createComponentFile(bundleId, inputArgs, 'HELPER');
		// 		createComponentFile(bundleId, inputArgs, 'RENDERER');
		// 		createComponentFile(bundleId, inputArgs, 'STYLE');
		// 	}
			
		// 	callback(); //if the files end up being deleted before we read them then look here first when debugging
		// }

		
	});
}

function queryForExistingBundle(userInput, callback){
	conn.tooling.query("Select Id, DeveloperName FROM AuraDefinitionBundle WHERE DeveloperName ='" + userInput.bundleInfo.name + "'", function(err, res){
		if (err) { return console.error(chalk.red(err)); }
		callback(null, {queryResult: res, userInput: userInput});
	});
}

function isEvent(name){
	
	return name.substring(0,10) === 'strike_evt';
}
function isToken(name){
	
	return name === 'defaultTokens';
}

function createStaticResource(name){
	log('we are in createStaticResource');

	fs.readFile(process.cwd() + '/strike-components/' + name + '.resource', 'utf8', function(err, contents){
		if(err){
			log(err);
		} else {
			var encodedBody = new Buffer(contents).toString('base64');
			log('we now have the body');
		}

		conn.tooling.sobject('StaticResource').create({
			body: encodedBody,
			ContentType: 'text/javascript',
			CacheControl: 'Public',
			Name: name
		}, function(err, res){
			log('we are in the response???');
			if (err) { return console.error(err); }
			 console.log(res);
		});
	})
}

function createApplication(bundleId){
	conn.tooling.sobject('AuraDefinition').create({
		AuraDefinitionBundleId: bundleId,
	    DefType: 'APPLICATION',
	    Format: 'XML',
	    Source: '<aura:application></aura:application>'
	  }, function(err, res) {
	  if (err) { return console.error(err); }
	  console.log(res);
	});
}

function createComponentFile(bundleId, inputArgs, type){
	log('creating ' + type + ' file for ' + inputArgs.name);
		fs.readFile(process.cwd() + '/strike-components/' + inputArgs.name + '/' + inputArgs.name + fileExtensionMap[type], 'utf8', function(err, contents){
			log(process.cwd() + '/strike-components/' + inputArgs.name + '/' + inputArgs.name + fileExtensionMap[type]);
		if(validContent(contents)){
			conn.tooling.sobject('AuraDefinition').create({
				AuraDefinitionBundleId: bundleId,
				DefType: type,
				Format: fileFormatMap[type],
				Source: contents
			}, function(err, res){
				if (err) { return console.error(err + '!!!!'); }
			});
		}
	})
}

function upsertComponentFile(bundleId, inputArgs, type){
	log('upserting ' + type + ' file for ' + inputArgs.name);
		fs.readFile(process.cwd() + '/strike-components/' + inputArgs.name + '/' + inputArgs.name + fileExtensionMap[type], 'utf8', function(err, contents){
			log('reading from ' + process.cwd() + '/strike-components/' + inputArgs.name + '/' + inputArgs.name + fileExtensionMap[type]);
		if(validContent(contents)){
			conn.tooling.sobject('AuraDefinition').create({
				AuraDefinitionBundleId: bundleId,
				DefType: type,
				Format: fileFormatMap[type],
				Source: contents
			}, function(err, res){
				log(err)
				if (err) {
					if(err.errorCode === 'DUPLICATE_VALUE'){
						log('we have an error trying to insert a duplicate file');
						conn.tooling.query("Select Id, AuraDefinitionBundleId, DefType FROM AuraDefinition WHERE AuraDefinitionBundleId ='" + bundleId + "'" + "AND DefType ='"+ type + "'", function(err, res){
							if (err) { return console.error(chalk.red(err)); }
							console.log(res.records[0].Id + ' is the existing ID');
							var fileId = res.records[0].Id; 

							conn.tooling.sobject('AuraDefinition').update({Id: fileId, Source: contents}, function(err, res){
								if (err) { 
									console.error(err); 
								} else {
									console.log('we have updated a file');
									log(res);
								}
							});
						});
					} else {
						return console.error(err);	
					}
				} 
			});
		}
	})
}

function updateComponentFiles(bundleId, defTypeArray, callback){
	async.each(defTypeArray,
		function (defType, callback){
			async.waterfall([
				function queryFileIdByDefType(callback){
					conn.tooling.query("Select Id, AuraDefinitionBundleId, DefType FROM AuraDefinition WHERE AuraDefinitionBundleId ='" + bundleId + "'" + "AND DefType ='"+ defType + "'", function(err, res){
						if (err) { return console.error(chalk.red(err)); }
						var fileId = res.records[0].Id;
						log('ID: ' + res.records[0].Id);
						callback(null, fileId);
					});
				},
				function readFile(fileId, callback){
					fs.readFile(process.cwd() + '/strike-components/' + process.argv[2] + '/' + process.argv[2] + fileExtensionMap[defType], 'utf8', function(err, contents){
						console.log("reading file " + process.cwd() + '/strike-components/' + process.argv[2] + '/' + process.argv[2] + fileExtensionMap[defType]);
						var fileContent = contents;
						callback(null, fileId, fileContent);
					});
				},
				function deployFile(fileId, fileContent, callback){
					conn.tooling.sobject('AuraDefinition').update({Id: fileId, Source: fileContent}, function(err, res){
						if (err) { 
							console.error(err); 
							callback(null, defType);
						} else {
							console.log('we depoloyed ' + defType + ' has been updated');
							callback(null, defType);	
						}
					});
				}
			], function(err, result){
				if (err) { return console.error(chalk.red(err)); }
				log('we are in the last part of the waterfall');
				callback();
			});
		}, 		
		function(err){
			if (err) { return console.error(chalk.red(err)); }
			console.log('async forEach has finsished');
			callback();
		}
	);
}

function generateRandomComponentName(){
	var date = new Date();
	var dateComponents = [
	    date.getSeconds(),
	    date.getMilliseconds()
	];

	var randomInt = dateComponents.join("");
	var componentName = 'Prototype_Component' + randomInt;
	return componentName;
}

function downloadFlagExists() {
	return process.argv[2] == '-download' || process.argv[2] == '-d';
}

function addFlagExists() {
	return process.argv[2] == '-add' || process.argv[2] == '-a';
}

function setFlagExists() {
	return process.argv[2] == '-set' || process.argv[2] == '-s';
}

function log(text){
	if(isDev){
		console.log(text);
	}
}