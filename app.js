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
var commander = require('commander');

const REPO_BASE_URL = "https://raw.githubusercontent.com/appiphony/Strike-Components/master";

const fileExtensionMap = {
		COMPONENT: '.cmp',
		CONTROLLER: 'Controller.js',
		HELPER: 'Helper.js',
		RENDERER: 'Renderer.js',
		EVENT: '.evt',
		RESOURCE: '.resource',
		STYLE: '.css',
		TOKENS: '.tokens'
	};

const fileFormatMap = {
		COMPONENT: 'XML',
		CONTROLLER: 'JS',
		HELPER: 'JS',
		RENDERER: 'JS',
		EVENT: 'XML',
		TOKENS: 'XML',
		STYLE: 'CSS'
	};

var dependencyMap;
var conn = new jsforce.Connection();

intializeDatabase();

if(disconnectCommandExists()){
	fs.unlinkSync(process.cwd() + "/db.json");
	console.log('Credentials have been disconnected');
} else if(connectCommandExists()){
	prompt.start();
	getUserInput(function(callback, userInput){
		saveUserInput(userInput.username, userInput.password);
		console.log('Credentials for ' + userInput.username + ' connected');
	});
} else {
	configureHelpCommand();
	drawScreen();
	createStrikeComponentFolder();
	prompt.start();
	async.waterfall([
		downloadDependencyMap,
		downloadTargetComponents,
		getUserInput,
		login,
		upsertComponentFiles,
	], function(err, result){
		deleteFolderRecursive(process.cwd() + "/strike-components");
	});
}

function getUserInput(callback){
	log('entering getUserInput');
	prompt.get(configurePromptSchema(), function (err, res){
		if (err) { return console.error(chalk.red(err)); }
		var userInput = createUserInputObj(res);
		callback(null, userInput);
	});	
}

function login(userInput, callback){
	log('entering login');
	conn.login(userInput.username, userInput.password, function(err, res) {
		if (err) { return console.error(chalk.red(err)); }
		callback(null);
	});
}

function upsertComponentFiles(callback){
	log('entering upsertComponentFiles');
	var bundlesToCreate = dependencyMap[process.argv[2]];
	async.eachSeries(bundlesToCreate, function(bundle, callback){
		if(isApex(bundle)){
			log('we are not creating a bundle, we need to create an apex class instead');
			createApexClass(bundle, function(){
				callback(null);	
			});
			
		} else {
			var tmpBundleInfo = {
				name: bundle,
					description: 'I was created from Strike-CLI'
			};

			if(requiresD3(bundle)){
				createStaticResource('d3');
			}

			createAuraDefinitionBundle(tmpBundleInfo, function(){
				callback(null);
			});					
		}
			
	}, function(err){
		if(err) {
	      callback(null, err);
	    } else {
	      callback(null, 'done');
	    }
	});
}

function requiresD3(bundle){
	
	return bundle === 'strike_chart';
}

function connectCommandExists() {

	return process.argv[2] == 'connect';
}

function disconnectCommandExists() {

	return process.argv[2] == 'disconnect';
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


function downloadDependencyMap(callback){
	http.get(REPO_BASE_URL + '/dependency.json', function(response){
		if (response.statusCode !== 200) { return console.error(chalk.red(err)); }
		var body = '';
		
		response.on('data', function(d){
			body += d;
		});

		response.on('end', function(){
			dependencyMap = JSON.parse(body);
			callback();
		});
	});
}

function downloadTargetComponents(callback, targetComponents){
	log('entering downloadTargetComponents');

	if(dependencyMap.hasOwnProperty(process.argv[2])){
		var targetComponents = dependencyMap[process.argv[2]];

		targetComponents.forEach(function(componentName){
			downloadComponentBundle(componentName);
		});
		
		callback(null);
	} else {
		console.log('Sorry, ' + process.argv[2] + ' is not a supported component');
	}
}

function isApex(fileName){

	return fileName.substring(fileName.length - 4) === '.cls'
}

function downloadComponentBundle(componentName){
	if(isApex(componentName)){
		downloadFile(componentName, 'APEX');
	} else {
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
}

function downloadFile(fileName, fileExtension){
	var fileSource;
	var fileDestination;

	if(fileExtension === 'RESOURCE'){
		fileSource = REPO_BASE_URL + "/staticresources/" + fileName + fileExtensionMap[fileExtension];
		fileDestination = fs.createWriteStream(process.cwd() + "/strike-components/" + fileName + fileExtensionMap[fileExtension], {flags: 'w', mode: 0755});
	} else if(fileExtension === 'APEX'){
		fileSource = REPO_BASE_URL + "/classes/" + fileName;
		fileDestination = fs.createWriteStream(process.cwd() + "/strike-components/" + fileName, {flags: 'w', mode: 0755});
	} else {
		fileSource = REPO_BASE_URL + "/aura/" + fileName + "/" + fileName + fileExtensionMap[fileExtension]
		fileDestination = fs.createWriteStream(process.cwd() + "/strike-components/" + fileName + "/" + fileName + fileExtensionMap[fileExtension], {flags: 'w', mode: 0755});
	}

	async.waterfall([
		function requestFile(callback){
				http.get(fileSource, function(response) {
				callback(null, response);
			});
		},
		function writeResponseToFile(response, callback){
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
                log('deleted ' + curPath);
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

function createApexClass(bundle, callback){
	log('upserting ' + bundle);
	fs.readFile(process.cwd() + '/strike-components/' + bundle, 'utf8', function(err, contents){
		conn.tooling.sobject('ApexClass').create({
			body: contents
		}, function(err, res){
			if(err){
				if(err.errorCode === 'DUPLICATE_VALUE'){
					conn.tooling.query("SELECT Id, Name FROM ApexClass WHERE Name = " + "'" + bundle.substring(0, bundle.length - 4) + "'", function(err, res){
						if (err) { return console.error(chalk.red(err)); }
						var fileId = res.records[0].Id; 
						log(chalk.blue('we get here right before running the callback'));
						conn.tooling.sobject('ApexClassMember').update({Id: fileId, Body: contents}, function(err, res){
							log(chalk.blue('we dont get here right after running the callback'));
							if(err){
								console.log(err);
								callback();	
							} else {
								console.log(bundle + ' was updated');
								callback();	
							}
						});
					});
				}
			} else{
				console.log(bundle + ' was created');
				callback();	
			}
		});
	})
}

function createAuraDefinitionBundle(inputArgs, callback){
	conn.tooling.sobject('AuraDefinitionBundle').create({
		Description: inputArgs.description, // my description
	  	DeveloperName: inputArgs.name,
	  	MasterLabel: inputArgs.name, 
	  	ApiVersion:'36.0'
	}, 	function(err, res){
		
		var bundleId;
		
		if(err){
			if(err.errorCode === 'DUPLICATE_DEVELOPER_NAME'){
				conn.tooling.query("Select Id, DeveloperName FROM AuraDefinitionBundle WHERE DeveloperName ='" + inputArgs.name + "'", function(err, res){
					if (err) { return console.error(chalk.red(err)); }
					console.log(res.records[0].DeveloperName + ' bundle already exists, updating its respective files...');
					bundleId = res.records[0].Id;

					upsertFiles(bundleId, inputArgs, function(){
						callback();
					});
				});
			} else{
				{ return console.error(chalk.red(err)); }
			}
		} else{
			console.log(inputArgs.name + ' bundle was created')
			bundleId = res.id;

			upsertFiles(bundleId, inputArgs, function(){
				callback();
			});
		}
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
				if (err) {
					if(err.errorCode === 'DUPLICATE_VALUE'){
						log('we have an error trying to insert a duplicate file');
						conn.tooling.query("Select Id, AuraDefinitionBundleId, DefType FROM AuraDefinition WHERE AuraDefinitionBundleId ='" + bundleId + "'" + "AND DefType ='"+ type + "'", function(err, res){
							if (err) { return console.error(chalk.red(err)); }
							log(res.records[0].Id + ' is the existing ID');
							var fileId = res.records[0].Id; 

							conn.tooling.sobject('AuraDefinition').update({Id: fileId, Source: contents}, function(err, res){
								if (err) { 
									console.error(err); 
								} else {
									console.log(type + ' file for ' + inputArgs.name + ' ' + type + ' was updated');
								}
							});
						});
					} else {
						return console.error(err);	
					}
				} else{
					console.log(type + ' file for ' + inputArgs.name + ' ' + type + ' was created');
				}
			});
		}
	})
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

function configureHelpCommand(){
	drawScreen();
	commander
		.usage('<component_name> [options]')
		.option('-v, --verbose', 'verbose mode for development')
		.option('connect', 'connect/store credentials')
		.option('disconnect', 'disconnects stored credentials');
		

	commander.on('--help', function(){
		console.log('  Supported Components:');
		console.log('');
		console.log('    <strike_tooltip>');
		console.log('    <strike_badge>');
		console.log('    <strike_chart>');
		console.log('    <strike_modal>');
		console.log('    <strike_textarea>');
		console.log('    <strike_select>');
		console.log('    <strike_datepicker>');
		console.log('    <strike_multiSelectPicklist>');
		console.log('    <strike_lookup>');
		console.log('');
	});

	commander.parse(process.argv);
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

function verboseFlagExists() {
	return process.argv.indexOf('-v') > -1 || process.argv.indexOf('--verbose') > -1;
}

function log(text){
	if(verboseFlagExists()){
		console.log(text);
	}
}