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

var REPO_BASE_URL = "https://raw.githubusercontent.com/appiphony/Strike-Components/master/components";

var conn = new jsforce.Connection();

if(resetFlagExists()){
	fs.unlinkSync(process.cwd() + "/db.json");
	console.log('Configuration file reset');
} else {
	var targetComponent = process.argv[2];

	intializeDatabase();
	drawScreen();
	createStrikeComponentFolder();
	downloadTargetComponents(targetComponent);
	prompt.start();
	async.waterfall([
		function getUserInputX(callback){
			prompt.get(configurePromptSchema(), function (err, res){
				if (err) { return console.error(chalk.red(err)); }
				var userInput = createUserInputObj(res);
				callback(null, userInput);
			});	
		},
		function login(userInput, callback){
			conn.login(userInput.username, userInput.password, function(err, res) {
				if (err) { return console.error(chalk.red(err)); }
				saveUserInput(userInput.username, userInput.password); //comment this if you dont want to capture credentials
				callback(null, userInput);
			});
		},
		function queryForExistingBundle(userInput, callback){
			conn.tooling.query("Select Id, DeveloperName FROM AuraDefinitionBundle WHERE DeveloperName ='" + process.argv[2] + "'", function(err, res){
				if (err) { return console.error(chalk.red(err)); }
				callback(null, {queryResult: res, userInput: userInput});
			});
		},
	], function(err, result){
		async.waterfall([
			function upsertComponentFiles(callback){
				if (bundleExists(result.queryResult)){
					var bundleId = result.queryResult.records[0].Id;
					updateComponentFiles(bundleId, ['COMPONENT', 'CONTROLLER', 'HELPER', 'RENDERER'], function(){
						callback(null);
					});
				} else {
					createAuraDefinitionBundle(result.userInput.bundleInfo, function(){
						callback(null);
					});
				}
			}
		], function(err, result){
			deleteFolderRecursive(process.cwd() + "/strike-components");
		});
	});
}

function intializeDatabase (){
	db.defaults({ credentials: []})
		.value();	
}

function resetFlagExists() {
	return process.argv[2] == '-reset' || process.argv[2] == '-r';
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

function downloadTargetComponents(targetComponents){
	if(Array.isArray(targetComponents)){
		targetComponents.forEach(function(componentName){
			downloadComponentBundle(componentName);
		});
	} else {
		downloadComponentBundle(targetComponents);
	}
}

function downloadComponentBundle(componentName){
	fs.mkdirSync(process.cwd() + "/strike-components/" + componentName);
	downloadComponentFile(componentName, 'component');
	downloadComponentFile(componentName, 'controller');
	downloadComponentFile(componentName, 'helper');
	downloadComponentFile(componentName, 'renderer');
}

function downloadComponentFile(componentName, fileType){
	var fileTypeMap = {
		component: '.cmp',
		controller: 'Controller.js',
		helper: 'Helper.js',
		renderer: 'Renderer.js'
	};

	var file = fs.createWriteStream(process.cwd() + "/strike-components/" + componentName + "/" + componentName + fileTypeMap[fileType], {flags: 'w', mode: 0755});

	async.waterfall([
		function requestFile(callback){
			console.log('downloading from url');
			http.get(REPO_BASE_URL + "/" + componentName + "/" + componentName + fileTypeMap[fileType], function(response) {
				callback(null, response);
			});
		},
		function writeResponseToFile(response, callback){
			console.log('saving the response');
			response.pipe(file);
			var body = '';
			
			response.on('data', function(d){
				body += d;
			});

			response.on('end', function(){
				callback(null, body)
			});
		},
		function verifyFileContents(body, callback){
			// console.log('checking for 404');
			if(body == '404: Not Found\n'){
				//if we find out later that the file is actually a 404, we go and delete the file since it wont save to Salesforce
				fs.unlinkSync(process.cwd() + "/strike-components/" + componentName + "/" + componentName + fileTypeMap[fileType]);
				console.log(process.cwd() + "/strike-components/" + componentName + "/" + componentName + fileTypeMap[fileType] + " was deleted");
			}		
		}
	], function(err, result){
		if (err) { return console.error(chalk.red(err)); }
		console.log('all done');
	});
}

function doesComponentFolderExist(){

	return fs.existsSync(process.cwd() + "/strike-components"); 
}


function createUserInputObj(promptResponse){
	var userInputObj = {
		username: promptResponse.username || db.get('credentials').find({ id: 1 }).value().username,
		password: promptResponse.password || db.get('credentials').find({ id: 1 }).value().password,
		// username: promptResponse.username || process.env.SF_STRIKE_USERNAME, //uncomment for faster development
		// password: promptResponse.password || process.env.SF_STRIKE_PASSWORD, //uncomment for faster development
		bundleInfo: {
			name: process.argv[2],
			// name: promptResponse.inputComponentName || generateRandomComponentName(), //uncomment for faster development
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

function bundleExists(response){
	return response.records.length > 0;
}

function createAuraDefinitionBundle(inputArgs, callback){
	conn.tooling.sobject('AuraDefinitionBundle').create({
		Description: inputArgs.description, // my description
	  	DeveloperName: inputArgs.name,
	  	MasterLabel: inputArgs.name, 
	  	ApiVersion:'32.0'
	}, 	function(err, res){
		if (err) { 

			return console.error(err); 
		}
		console.log(inputArgs.name + ' Bundle has been created');
		// console.log(res);

		var bundleId = res.id;

		createComponentCMP(bundleId, inputArgs);
		createComponentController(bundleId, inputArgs);
		createComponentHelper(bundleId, inputArgs);
		createComponentRenderer(bundleId, inputArgs);
		callback(); //if the files end up being deleted before we read them then look here first when debugging
	});
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

function createComponentCMP(bundleId, inputArgs){
	fs.readFile(process.cwd() + '/strike-components/' + process.argv[2] + '/' + process.argv[2] + '.cmp', 'utf8', function(err, contents){
		if(err){
			console.log('CMP file not found. Falling back on default');
			var cmpContent = '<aura:component></aura:component>';
		} else {
			var cmpContent = contents;
		}
		
		conn.tooling.sobject('AuraDefinition').create({
			AuraDefinitionBundleId: bundleId,
		    DefType: 'COMPONENT',
		    Format: 'XML',
		    Source: cmpContent
		  }, function(err, res) {
		  if (err) { return console.error(err); }
		  console.log(inputArgs.name + ' CMP has been created');
		});
	});
}

function createComponentController(bundleId, inputArgs){
	fs.readFile(process.cwd() + '/strike-components/' + process.argv[2] + '/' + process.argv[2] + 'Controller.js', 'utf8', function(err, contents){
		if(err){
			console.log('Controller file not found. Falling back on default');
			var controllerContent = '({\n\tmyAction : function(component, event, helper) {\n\t}\n})';
		} else {
			var controllerContent = contents;	
		}

		conn.tooling.sobject('AuraDefinition').create({
			AuraDefinitionBundleId: bundleId,
		    DefType: 'CONTROLLER',
		    Format: 'JS',
		    Source: controllerContent
		  }, function(err, res) {
		  if (err) { return console.error(err); }
		  console.log(inputArgs.name + ' Controller has been created');
		});
	});
}

function updateComponentFiles(bundleId, defTypeArray, callback){
	var defTypeMap = {
		COMPONENT: '.cmp',
		CONTROLLER: 'Controller.js',
		HELPER: 'Helper.js',
		RENDERER: 'Renderer.js'
	};

	async.each(defTypeArray,
		function (defType, callback){
			async.waterfall([
				function queryFileIdByDefType(callback){
					conn.tooling.query("Select Id, AuraDefinitionBundleId, DefType FROM AuraDefinition WHERE AuraDefinitionBundleId ='" + bundleId + "'" + "AND DefType ='"+ defType + "'", function(err, res){
						if (err) { return console.error(chalk.red(err)); }
						var fileId = res.records[0].Id;
						callback(null, fileId);
					});
				},
				function readFile(fileId, callback){
					fs.readFile(process.cwd() + '/strike-components/' + process.argv[2] + '/' + process.argv[2] + defTypeMap[defType], 'utf8', function(err, contents){
						console.log("reading file " + process.cwd() + '/strike-components/' + process.argv[2] + '/' + process.argv[2] + defTypeMap[defType]);
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
				callback();
			});
		}, 		
		function(err){
			if (err) { return console.error(chalk.red(err)); }
			console.log('async for each has finsished');
			callback();
		}
	);
}

function createComponentHelper(bundleId, inputArgs){
	fs.readFile(process.cwd() + '/strike-components/' + process.argv[2] + '/' + process.argv[2] + 'Helper.js', 'utf8', function(err, contents){
		if(err){
			console.log('Helper file not found. Falling back on default');
			var helperContent = '({\n\thelperMethod : function() {\n\t}\n})';
		} else {
			var helperContent = contents;
		}

		conn.tooling.sobject('AuraDefinition').create({
		AuraDefinitionBundleId: bundleId,
		    DefType: 'HELPER',
		    Format: 'JS',
		    Source: helperContent
		  }, function(err, res) {
		  if (err) { return console.error(err); }
		  console.log(inputArgs.name + ' Helper has been created');
		});
	});
}

function createComponentRenderer(bundleId, inputArgs){
	fs.readFile(process.cwd() + '/strike-components/' + process.argv[2] + '/' + process.argv[2] + 'Renderer.js', 'utf8', function(err, contents){
		if(err){
			console.log('Renderer file not found. Falling back on default');
			var rendererContent = '({\n\t// Your renderer method overrides go here \n})';
		} else {
			var rendererContent = contents;
		}

		conn.tooling.sobject('AuraDefinition').create({
		AuraDefinitionBundleId: bundleId,
		    DefType: 'RENDERER',
		    Format: 'JS',
		    Source: rendererContent
		  }, function(err, res) {
		  if (err) { return console.error(err); }
		  console.log(inputArgs.name + ' Renderer has been created');
		});
	});
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