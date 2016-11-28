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

var REPO_BASE_URL = "https://raw.githubusercontent.com/appiphony/Strike-Components/master/components";
var TARGET_COMPONENTS = ['strike_badge', 'svg']; //See if we can find a way to iterate through the Github folder to avoid this

var conn = new jsforce.Connection();

db.defaults({ credentials: []})
	.value();

if(addFlagExists()){
	prompt.start();

	prompt.get(['username', 'password', 'isDefault'], function(err, result){

		if(result.isDefault == 'true' || result.isDefault == 'True'){
			//setIsDefaultToFalseForAllRecords()

			// console.log('isDefault is true');
			// db.get('credentials')
			// 	.find({ isDefault: 'true'})
			// 	.assign({ isDefault: 'false'})
			// 	.value();			
		}

		db.get('credentials')
			.push({ username: result.username, password: result.password, orgName: process.argv[3], isDefault: result.isDefault})
			.value();
	});
} else if(setFlagExists()){
	console.log(db.get('credentials')
			.find({ orgName: process.argv[3] })
			.assign({ isDefault: 'true' })
			.value());

		console.log(process.argv[3] + ' has been set as the default user');

} else {
	var promptSchema = configurePromptSchema();

	drawScreen();
	createStrikeComponentFolder();
	downloadTargetComponents(process.argv[2]);
	getUserInput();
}


function addFlagExists() {
	return process.argv[2] == '-add' || process.argv[2] == '-a';
}

function setFlagExists() {
	return process.argv[2] == '-set' || process.argv[2] == '-s';
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
	var request = http.get(REPO_BASE_URL + "/" + componentName + "/" + componentName + fileTypeMap[fileType], function(response) {
		response.pipe(file);
		var body = '';
		
		response.on('data', function(d){
			body += d;
		});

		response.on('end', function(){
			if(body == '404: Not Found\n'){
				//if we find out later that the file is actually a 404, we go and delete the file since it wont save to Salesforce
				fs.unlinkSync(process.cwd() + "/strike-components/" + componentName + "/" + componentName + fileTypeMap[fileType]);
			}		
		});
		
	});
}

function doesComponentFolderExist(){

	return fs.existsSync(process.cwd() + "/strike-components"); 
}

function getUserInput(){
	prompt.start();
	prompt.get(promptSchema, function (err, res){
		if (err) { return console.error(chalk.red(err)); }

		var userInput = createUserInputObj(res);

		db.get('credentials')
			.push({ username: userInput.username, password: userInput.password})
			.value();

		conn.login(userInput.username, userInput.password, function(err, res) {
			if (err) { return console.error(chalk.red(err)); }
			//checking if a Aura Definition Bundle already exists with the same name as the argument
			conn.tooling.query("Select Id, DeveloperName FROM AuraDefinitionBundle WHERE DeveloperName ='" + process.argv[2] + "'", function(err, res){
				if (err) { return console.error(chalk.red(err)); }

				if(bundleExists(res)){
					var bundleId = res.records[0].Id;
					updateComponentFiles(bundleId, ['COMPONENT', 'CONTROLLER', 'HELPER', 'RENDERER'], function(){
						deleteFolderRecursive(process.cwd() + "/strike-components");
					});
				} else{ 
					createAuraDefinitionBundle(userInput.bundleInfo, function(err){
						deleteFolderRecursive(process.cwd() + "/strike-components");
					});
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

	var itemsProcessed = 0;
	
	defTypeArray.forEach(function(defType){
		conn.tooling.query("Select Id, AuraDefinitionBundleId, DefType FROM AuraDefinition WHERE AuraDefinitionBundleId ='" + bundleId + "'" + "AND DefType ='"+ defType + "'", function(err, res){
			var fileId = res.records[0].Id;
			fs.readFile(process.cwd() + '/strike-components/' + process.argv[2] + '/' + process.argv[2] + defTypeMap[defType], 'utf8', function(err, contents){
				if(err){
					console.log(defType + ' file not found. Not updating.');
				} else {
					var fileContent = contents;
					conn.tooling.sobject('AuraDefinition').update({
						Id: fileId,
					    Source: fileContent
					  }, function(err, res) {
					  if (err) { return console.error(err); }
					  console.log(defType + ' has been updated');
					});	
				}
				//below two lines are needed to run a callback once a forEach loop has finished
				//Hopefully this hack can be elimintated after implementing an async library
				itemsProcessed++;
				if(itemsProcessed == defTypeArray.length) { callback(); }
			});
		});
	});
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