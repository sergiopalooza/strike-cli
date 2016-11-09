#!/usr/bin/env node
var fs = require('fs');
var prompt = require('prompt');
var jsforce = require('jsforce');
var chalk = require('chalk');
var figlet = require('figlet');
var clear = require('clear');

clear();
console.log(
  chalk.cyan(
    figlet.textSync('Strike-CLI', { horizontalLayout: 'full' })
  )
);



var conn = new jsforce.Connection();
var promptSchema = configurePromptSchema();



prompt.start();
prompt.get(promptSchema, function (err, res){
	var username = res.username || process.env.SF_STRIKE_USERNAME;
	var password = res.password || process.env.SF_STRIKE_PASSWORD;
	
	var componentInfo = {};
	componentInfo.name = res.inputComponentName || createComponentName();
	componentInfo.description = res.inputDescription || 'I was created from Strike-CLI';

	conn.login(username, password, function(err, res) {
		if (err) { return console.error(err); }
		createAuraDefinitionBundle(componentInfo);
	});
});

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
			},
			inputComponentName: {
				description: 'Component Name'
			},
			inputDescription: {
				description: 'Description'
			}
		}
	};
	return promptSchema;
}

function createAuraDefinitionBundle(componentInfo){
	conn.tooling.sobject('AuraDefinitionBundle').create({
		Description: componentInfo.description, // my description
	  	DeveloperName: componentInfo.name,
	  	MasterLabel: componentInfo.name, 
	  	ApiVersion:'32.0'
	}, 	function(err, res){
		if (err) { return console.error(err); }
		console.log(componentInfo.name + ' bundle has been created');
		console.log(res);

		var bundleId = res.id;

		createComponent(bundleId);
		createComponentController(bundleId);
		createComponentHelper(bundleId);
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

function createComponent(bundleId){
	fs.readFile('./' + process.argv[2] + '/' + process.argv[2] + '.cmp', 'utf8', function(err, contents){
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
		  console.log(res);
		});
	});
}

function createComponentController(bundleId){
	conn.tooling.sobject('AuraDefinition').create({
		AuraDefinitionBundleId: bundleId,
	    DefType: 'CONTROLLER',
	    Format: 'JS',
	    Source: '({\n\tmyAction : function(component, event, helper) {\n\t}\n})'
	  }, function(err, res) {
	  if (err) { return console.error(err); }
	  console.log(res);
	});
}

function createComponentHelper(bundleId){
	conn.tooling.sobject('AuraDefinition').create({
	AuraDefinitionBundleId: bundleId,
	    DefType: 'HELPER',
	    Format: 'JS',
	    Source: '({\n\thelperMethod : function() {\n\t}\n})'
	  }, function(err, res) {
	  if (err) { return console.error(err); }
	  console.log(res);
	});
}

function createComponentName(){
	var date = new Date();
	var dateComponents = [
	    date.getSeconds(),
	    date.getMilliseconds()
	];

	var randomInt = dateComponents.join("");
	var componentName = 'Prototype_Component' + randomInt;
	return componentName;
}