#!/usr/bin/env node
var fs = require('fs');
var http = require('https');
var prompt = require('prompt');
var jsforce = require('jsforce');
var chalk = require('chalk');
var figlet = require('figlet');
var clear = require('clear');

var conn = new jsforce.Connection();
var promptSchema = configurePromptSchema();

var REPO_BASE_URL = "https://raw.githubusercontent.com/appiphony/Strike-Components/master/components";
var TARGET_COMPONENTS = ['strike_badge', 'svg']; //See if we can find a way to iterate through the Github folder to avoid this

drawScreen();

if(downloadFlagExists()){
	createStrikeComponentFolder();
	downloadTargetComponents(TARGET_COMPONENTS);
} else {
	if(!doesComponentFolderExist()){
		console.error(chalk.yellow("WARNING: COMPONENT FOLDER NOT FOUND. TRY 'sudo strike -download' TO DOWNLOAD COMPONENTS"));
	}
	getUserInput();
}

function configurePromptSchema(){
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
}

function drawScreen(){
	clear();
	console.log(
	  chalk.cyan(
	    figlet.textSync('Strike-CLI', { horizontalLayout: 'full' })
	  )
	);
}

function downloadFlagExists() {
	return process.argv[2] == '-download' || process.argv[2] == '-d';
}

function createStrikeComponentFolder(){
	deleteFolderRecursive(__dirname + "/strike-components"); //uncomment if you want to create the folder everytime
	fs.existsSync(__dirname + "/strike-components") || fs.mkdirSync(__dirname + "/strike-components");	
}

function downloadTargetComponents(targetComponents){
	targetComponents.forEach(function(component){
		downloadComponentBundle(component);
	});
}

function doesComponentFolderExist(){

	return fs.existsSync(__dirname + "/strike-components"); 
}

function getUserInput(){
	prompt.start();
	prompt.get(promptSchema, function (err, res){
		if (err) { return console.error(chalk.red(err)); }
		var userInput = createUserInputObj(res);
		
		conn.login(userInput.username, userInput.password, function(err, res) {
			if (err) { return console.error(chalk.red(err)); }
			//checking if a Aura Definition Bundle already exists with the same name as the argument
			conn.tooling.query("Select Id, DeveloperName FROM AuraDefinitionBundle WHERE DeveloperName ='" + process.argv[2] + "'", function(err, res){
				if (err) { return console.error(chalk.red(err)); }
				if(res.records.length > 0){
					var bundleId = res.records[0].Id;
					

					//How can I decouple the query and update of the component
					conn.tooling.query("Select Id, AuraDefinitionBundleId, DefType FROM AuraDefinition WHERE AuraDefinitionBundleId ='" + bundleId + "'" + "AND DefType ='COMPONENT'", function(err, res){
						updateComponentCMP(res.records[0].Id);
					});

					conn.tooling.query("Select Id, AuraDefinitionBundleId, DefType FROM AuraDefinition WHERE AuraDefinitionBundleId ='" + bundleId + "'" + "AND DefType ='CONTROLLER'", function(err, res){
						updateComponentController(res.records[0].Id);
					});

					conn.tooling.query("Select Id, AuraDefinitionBundleId, DefType FROM AuraDefinition WHERE AuraDefinitionBundleId ='" + bundleId + "'" + "AND DefType ='HELPER'", function(err, res){
						updateComponentHelper(res.records[0].Id);
					});

					conn.tooling.query("Select Id, AuraDefinitionBundleId, DefType FROM AuraDefinition WHERE AuraDefinitionBundleId ='" + bundleId + "'" + "AND DefType ='RENDERER'", function(err, res){
						updateComponentRenderer(res.records[0].Id);
					});
	
				} else { //No bundle was found with the same Developer Name
					createAuraDefinitionBundle(userInput.bundleInfo);
				}

			});
		});
	});
}

function createUserInputObj(promptResponse){
	var userInputObj = {
		username: promptResponse.username || process.env.SF_STRIKE_USERNAME,
		password: promptResponse.password || process.env.SF_STRIKE_PASSWORD,
		bundleInfo: {
			name: process.argv[2],
			// name: promptResponse.inputComponentName || generateRandomComponentName(),
			description: promptResponse.inputDescription || 'I was created from Strike-CLI'
		}
	};
	return userInputObj;
}

function downloadComponentBundle(component){
	fs.mkdirSync(__dirname + "/strike-components/" + component);
	
	downloadComponentFile(component, 'component');
	downloadComponentFile(component, 'controller');
	downloadComponentFile(component, 'helper');
	downloadComponentFile(component, 'renderer');
}

function downloadComponentFile(component, fileType){
	var fileTypeMap = {
		component: '.cmp',
		controller: 'Controller.js',
		helper: 'Helper.js',
		renderer: 'Renderer.js'
	};

	var file = fs.createWriteStream(__dirname + "/strike-components/" + component + "/" + component + fileTypeMap[fileType]);
	var request = http.get(REPO_BASE_URL + "/" + component + "/" + component + fileTypeMap[fileType], function(response) {
		var body = '';
		
		response.on('data', function(d){
			body += d;
		});

		response.on('end', function(){
			if(body == '404: Not Found\n'){
				//if we find out later that the file is actually a 404, we go and delete the file since it wont save to Salesforce
				fs.unlinkSync(__dirname + "/strike-components/" + component + "/" + component + fileTypeMap[fileType]);
			}		
		});
		response.pipe(file);
	});
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
            }
        });
        fs.rmdirSync(path);
    }
}

function createAuraDefinitionBundle(inputArgs){
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
	fs.readFile(__dirname + '/strike-components/' + process.argv[2] + '/' + process.argv[2] + '.cmp', 'utf8', function(err, contents){
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

function updateComponentCMP(cmpId){
	fs.readFile(__dirname + '/strike-components/' + process.argv[2] + '/' + process.argv[2] + '.cmp', 'utf8', function(err, contents){
		if(err){
			console.log('CMP file not found. Falling back on default');
			var cmpContent = '<aura:component></aura:component>';
		} else {
			var cmpContent = contents;	
		}
		
		conn.tooling.sobject('AuraDefinition').update({
			Id: cmpId,
			Source: cmpContent
		  }, function(err, res) {
		  if (err) { return console.error(err); }
		  console.log('CMP has been updated');
		});
	});
}

function createComponentController(bundleId, inputArgs){
	fs.readFile(__dirname + '/strike-components/' + process.argv[2] + '/' + process.argv[2] + 'Controller.js', 'utf8', function(err, contents){
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

function updateComponentController(controllerId){
	fs.readFile(__dirname + '/strike-components/' + process.argv[2] + '/' + process.argv[2] + 'Controller.js', 'utf8', function(err, contents){
		if(err){
			console.log('Controller file not found. Falling back on default');
			var controllerContent = '({\n\tmyAction : function(component, event, helper) {\n\t}\n})';
		} else {
			var controllerContent = contents;	
		}

		conn.tooling.sobject('AuraDefinition').update({
			Id: controllerId,
		    Source: controllerContent
		  }, function(err, res) {
		  if (err) { return console.error(err); }
		  console.log('Controller has been updated');
		});
	});
}

function createComponentHelper(bundleId, inputArgs){
	fs.readFile(__dirname + '/strike-components/' + process.argv[2] + '/' + process.argv[2] + 'Helper.js', 'utf8', function(err, contents){
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

function updateComponentHelper(helperId){
	fs.readFile(__dirname + '/strike-components/' + process.argv[2] + '/' + process.argv[2] + 'Helper.js', 'utf8', function(err, contents){
		if(err){
			console.log('Helper file not found. Falling back on default');
			var helperContent = '({\n\thelperMethod : function() {\n\t}\n})';
		} else {
			var helperContent = contents;
		}

		conn.tooling.sobject('AuraDefinition').update({
			Id: helperId,
		    Source: helperContent
		  }, function(err, res) {
		  if (err) { return console.error(err); }
		  console.log('Helper has been updated');
		});
	});
}

function createComponentRenderer(bundleId, inputArgs){
	fs.readFile(__dirname + '/strike-components/' + process.argv[2] + '/' + process.argv[2] + 'Renderer.js', 'utf8', function(err, contents){
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

function updateComponentRenderer(rendererId){
	fs.readFile(__dirname + '/strike-components/' + process.argv[2] + '/' + process.argv[2] + 'Renderer.js', 'utf8', function(err, contents){
		if(err){
			console.log('Renderer file not found. Falling back on default');
			var rendererContent = '({\n\t// Your renderer method overrides go here \n})';
		} else {
			var rendererContent = contents;
		}

		conn.tooling.sobject('AuraDefinition').update({
			Id: rendererId,
		    Source: rendererContent
		  }, function(err, res) {
		  if (err) { return console.error(err); }
		  console.log('Renderer has been updated');
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