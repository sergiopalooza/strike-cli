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
var tokenParser = require('./tokenParser.js');

const REPO_BASE_URL = 'https://raw.githubusercontent.com/appiphony/Strike-Components/master';

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

if(doesCommandExist('disconnect')){
	fs.unlinkSync(process.cwd() + '/db.json');
	console.log('Credentials have been disconnected');
} else if(doesCommandExist('connect')){
	prompt.start();
	getUserInput(function(callback, userInput){
		saveUserInput(userInput.username, userInput.password);
		console.log('Credentials for ' + userInput.username + ' connected');
	});
} else if(upsertCommandExists()){
	drawScreen();
	createStrikeComponentFolder();
	prompt.start();
	async.waterfall([
		downloadDependencyMap,
		downloadTargetComponents,
		getUserInput,
		login,
		upsertComponentFiles,
	], function(err){
		if (err) { return console.error(chalk.red(err)); }
		deleteFolderRecursive(process.cwd() + '/strike-components');
	});
} else{
	configureHelpCommand();
	console.log(process.argv[2] + ' is not a valid command');
	commander.outputHelp();
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
	conn.login(userInput.username, userInput.password, function(err) {
		if (err) { return console.error(chalk.red(err)); }
		callback(null);
	});
}

function upsertComponentFiles(callback){
	log('entering upsertComponentFiles');
	var bundlesToCreate = dependencyMap[process.argv[3]];
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

function doesCommandExist(command){

	return process.argv[2] === command;
}

function upsertCommandExists(){

	return process.argv[2] == 'install' || process.argv[2] == 'update' || process.argv[2] == 'upsert';
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
	deleteFolderRecursive(process.cwd() + '/strike-components'); //uncomment if you want to create the folder everytime
	fs.existsSync(process.cwd() + '/strike-components') || fs.mkdirSync(process.cwd() + '/strike-components');	
}

function downloadDependencyMap(callback){
	http.get(REPO_BASE_URL + '/dependency.json', function(response){
		if (response.statusCode !== 200) {
			return console.error(chalk.red(response));
		}

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

function downloadTargetComponents(callback){
	log('entering downloadTargetComponents');

	if(dependencyMap.hasOwnProperty(process.argv[3])){
		var targetComponents = dependencyMap[process.argv[3]];

		targetComponents.forEach(function(componentName){
			downloadComponentBundle(componentName);
		});
		
		callback(null);
	} else {
		console.log('Sorry, ' + process.argv[3] + ' is not a supported component');
	}
}

function isApex(fileName){

	return fileName.substring(fileName.length - 4) === '.cls';
}

function downloadComponentBundle(componentName){
	if(isApex(componentName)){
		downloadFile(componentName, 'APEX');
	} else {
		fs.mkdirSync(process.cwd() + '/strike-components/' + componentName);

		if(requiresD3(componentName)){
			downloadFile('d3', 'RESOURCE');
		}

		var fileTypes = ['COMPONENT', 'CONTROLLER', 'HELPER', 'RENDERER', 'EVENT', 'STYLE', 'TOKENS'];

		fileTypes.forEach(function(fileType){
			downloadFile(componentName, fileType);
		});
	}
}

function downloadFile(fileName, fileExtension){
	var fileSource;
	var fileDestination;

	var defaultPermissions = 0o755;

	if(fileExtension === 'RESOURCE'){
		fileSource = REPO_BASE_URL + '/staticresources/' + fileName + fileExtensionMap[fileExtension];
		fileDestination = fs.createWriteStream(process.cwd() + '/strike-components/' + fileName + fileExtensionMap[fileExtension], {flags: 'w', mode: defaultPermissions});
	} else if(fileExtension === 'APEX'){
		fileSource = REPO_BASE_URL + '/classes/' + fileName;
		fileDestination = fs.createWriteStream(process.cwd() + '/strike-components/' + fileName, {flags: 'w', mode: defaultPermissions});
	} else {
		fileSource = REPO_BASE_URL + '/aura/' + fileName + '/' + fileName + fileExtensionMap[fileExtension];
		fileDestination = fs.createWriteStream(process.cwd() + '/strike-components/' + fileName + '/' + fileName + fileExtensionMap[fileExtension], {flags: 'w', mode: defaultPermissions});
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
				callback(null, body);
			});
		}
	], function(err){
		if (err) { return console.error(chalk.red(err)); }
	});
}

function validContent(body){

	return body != '404: Not Found\n';
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

	return db.get('credentials').find({ id: 1 }).value() != undefined;
}

function createUserInputObj(promptResponse){
	var userInputObj = {
		username: promptResponse.username || db.get('credentials').find({ id: 1 }).value().username,
		password: promptResponse.password || db.get('credentials').find({ id: 1 }).value().password,
		bundleInfo: {
			name: promptResponse.componentName || process.argv[3],
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
		files.forEach(function(file){
			var curPath = path + '/' + file;
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

function upsertFiles(bundleId, inputArgs, callback){
	if(isEvent(inputArgs.name)){
		upsertComponentFile(bundleId, inputArgs, 'EVENT');	
	} else if(isToken(inputArgs.name)){
		upsertTokenFile(bundleId, inputArgs, 'TOKENS');
	} else{
		var fileTypes = ['COMPONENT', 'CONTROLLER', 'HELPER', 'RENDERER', 'EVENT', 'STYLE'];

		fileTypes.forEach(function(fileType){
			upsertComponentFile(bundleId, inputArgs, fileType);
		});
	}
	
	callback();
}

function createApexClass(bundle, callback){
	console.log('upserting ' + bundle);
	fs.readFile(process.cwd() + '/strike-components/' + bundle, 'utf8', function(err, contents){
		conn.tooling.sobject('ApexClass').create({
			body: contents
		}, function(err){
			if(err){
				log(err);
				if(err.errorCode === 'DUPLICATE_VALUE'){
					async.waterfall([
						function queryForApexClassId(callback){
							log(chalk.cyan('Querying for Apex ID'));
							conn.tooling.query('SELECT Id, Name FROM ApexClass WHERE Name = ' + '\'' + bundle.substring(0, bundle.length - 4) + '\'', function(err, res){
								if (err) { return console.error(chalk.red(err)); }
								var fileId = res.records[0].Id;
								callback(null, fileId) ;
							});
						},
						function createMetaDataContainer(fileId, callback){
							log(chalk.cyan('Creating MetaDataContainer'));
							conn.tooling.sobject('MetaDataContainer').create({
								Name: generateRandomName('Container')
							}, function(err, res){
								if (err) { return console.error(chalk.red(err)); }
								log(res);
								var metaDataContainerId = res.id;
								callback(null, fileId, metaDataContainerId);
							});
						},
						function createApexClassMember(fileId, metaDataContainerId, callback){
							log(chalk.cyan('Creating ApexClassMember'));
							conn.tooling.sobject('ApexClassMember').create({
								MetaDataContainerId: metaDataContainerId,
								ContentEntityId: fileId,
								Body: contents
							}, function(err, res){
								if (err) { return console.error(chalk.red(err)); }
								log(res);
								callback(null, metaDataContainerId);
							});
						},
						function createContainerAsyncRequest(metaDataContainerId, callback){
							log(chalk.cyan('Creating containerAsyncRequest'));
							conn.tooling.sobject('containerAsyncRequest').create({
								MetaDataContainerId: metaDataContainerId,
								isCheckOnly: 'false'
							}, function(err, res){
								if (err) { return console.error(chalk.red(err)); }
								log(res);
								callback(null, res);
							});
						}
					], function(err){
						if (err) { return console.error(chalk.red(err)); }
						console.log(bundle + ' was updated');
						callback();
					});
				}
			} else{
				console.log(bundle + ' was created');
				callback();	
			}
		});
	});
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
				conn.tooling.query('Select Id, DeveloperName FROM AuraDefinitionBundle WHERE DeveloperName =\'' + inputArgs.name + '\'', function(err, res){
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
			console.log(inputArgs.name + ' bundle was created');
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
		}, function(err){
			if(err){
				if(err.errorCode === 'DUPLICATE_DEVELOPER_NAME'){
					console.log(name + ' static resource already exists');
				} 	
			}
		});
	});
}

function upsertTokenFile(bundleId, inputArgs, type){
	log('upserting ' + type + ' file for ' + inputArgs.name);
	fs.readFile(process.cwd() + '/strike-components/' + inputArgs.name + '/' + inputArgs.name + fileExtensionMap[type], 'utf8', function(err, contents){
		log('reading from ' + process.cwd() + '/strike-components/' + inputArgs.name + '/' + inputArgs.name + fileExtensionMap[type]);
		if(validContent(contents)){
			var strikeContents = contents;
			conn.tooling.sobject('AuraDefinition').create({
				AuraDefinitionBundleId: bundleId,
				DefType: type,
				Format: fileFormatMap[type],
				Source: strikeContents
			}, function(err){
				if (err) {
					if(err.errorCode === 'DUPLICATE_VALUE'){
						conn.tooling.query('Select Id, AuraDefinitionBundleId, DefType, SOURCE FROM AuraDefinition WHERE AuraDefinitionBundleId =\'' + bundleId + '\'' + 'AND DefType =\'' + type + '\'', function(err, res){
							if (err) { return console.error(chalk.red(err)); }
							var fileId = res.records[0].Id; 
							var remoteContents = res.records[0].Source;
							
							var linesToInsertArray = tokenParser.createLinesToInsert(strikeContents, remoteContents);

							if(!linesToInsertArray.length == 0){
								var mergedTokenFile = mergeTokenFile(remoteContents, linesToInsertArray);

								conn.tooling.sobject('AuraDefinition').update({Id: fileId, Source: mergedTokenFile}, function(err){
									if (err) { 
										console.error(err); 
									} else {
										console.log(type + ' file for ' + inputArgs.name + ' ' + type + ' was updated');
									}
								});
							}
						});
					} else {
						return console.error(err);	
					}
				} else{
					console.log(type + ' file for ' + inputArgs.name + ' ' + type + ' was created');
				}
			});
		}
	});
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
			}, function(err){
				if (err) {
					if(err.errorCode === 'DUPLICATE_VALUE'){
						log('we have an error trying to insert a duplicate file');
						conn.tooling.query('Select Id, AuraDefinitionBundleId, DefType FROM AuraDefinition WHERE AuraDefinitionBundleId =\'' + bundleId + '\'' + 'AND DefType =\'' + type + '\'', function(err, res){
							if (err) { return console.error(chalk.red(err)); }
							log(res.records[0].Id + ' is the existing ID');
							var fileId = res.records[0].Id; 

							conn.tooling.sobject('AuraDefinition').update({Id: fileId, Source: contents}, function(err){
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
	});
}

function mergeTokenFile (originalContent, linesToInsertArray) {
	var regexForFooter = /<\/aura:tokens>/g;
	var mergedSource = originalContent.replace(regexForFooter, linesToInsertArray.join(''));
	log('----------------------');
	log(mergedSource);
	log('----------------------');
	return mergedSource;
}

function generateRandomName(prefix){
	var date = new Date();
	var dateComponents = [
		date.getSeconds(),
		date.getMilliseconds()
	];

	var randomInt = dateComponents.join('');
	var randomName = prefix + randomInt;
	return randomName;
}

function configureHelpCommand(){
	drawScreen();
	commander
		.usage('<command> [component_name]')
		.command('install', 'upsert specified component and dependencies to your org')
		.command('update', 'upsert specified component and dependencies to your org')
		.command('upsert', 'upsert specified component and dependencies to your org')
		.command('connect', 'connect/store credentials')
		.command('disconnect', 'disconnects stored credentials')
		.option('-v, --verbose', 'verbose mode for development');
		
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

function verboseFlagExists() {
	return process.argv.indexOf('-v') > -1 || process.argv.indexOf('--verbose') > -1;
}

function log(text){
	if(verboseFlagExists()){
		console.log(text);
	}
}