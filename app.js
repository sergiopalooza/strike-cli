#!/usr/bin/env node
var fs = require('fs');
var prompt = require('prompt');
var jsforce = require('jsforce');
var chalk = require('chalk');
var figlet = require('figlet');
var clear = require('clear');
var Preferences = require('preferences');

// var conn = new jsforce.Connection();
// var conn;
// var prefs = new Preferences('strike');

// if(prefs.strike && prefs.strike.instanceUrl && prefs.strike.accessToken){
// 	conn = new jsforce.Connection({
// 		instanceUrl : prefs.strike.instanceUrl,
// 		accessToken : prefs.strike.accessToken
// 	});
// 	// return prefs.strike.accessToken;
// }


var conn = new jsforce.Connection({
	instanceUrl : 'https://strike-cli-dev-ed.my.salesforce.com',
	accessToken : '00D4100000121Oc!ASAAQMqOHLNKYRGjYMm9QPHMs6Jup7bdTVig7QIFthJezjMskT6MybH1ABke0EvhcZFW__c.CMg89bxVAPeRQGE6lEfUxR6z'
});

var promptSchema = configurePromptSchema();

clear();
console.log(
  chalk.cyan(
    figlet.textSync('Strike-CLI', { horizontalLayout: 'full' })
  )
);

prompt.start();
prompt.get(promptSchema, function (err, res){
	// var username = res.username || process.env.SF_STRIKE_USERNAME;
	// var password = res.password || process.env.SF_STRIKE_PASSWORD;
	
	var componentInfo = {};
	componentInfo.name = res.inputComponentName || createComponentName();
	componentInfo.description = res.inputDescription || 'I was created from Strike-CLI';
	createAuraDefinitionBundle(componentInfo);

	

	// conn.login(username, password, function(err, res) {
	// 	if (err) { return console.error(err); }
	// 	console.log(conn.accessToken);
 //  		console.log(conn.instanceUrl);
	// 	createAuraDefinitionBundle(componentInfo);
	// });
	
	// conn.login(username, password, function(err, res) {
	// 	if (err) { return console.error(err); }
	// 	console.log(conn.accessToken);
 //  		console.log(conn.instanceUrl);
	// 	createAuraDefinitionBundle(componentInfo);
	// });
});

// conn.login(username, password, function(err, res) {
// 	if (err) { return console.error(err); }
	
// 	prompt.start();
// 	prompt.get(promptSchema, function (err, res){
// 		var componentInfo = {};
// 		componentInfo.name = res.inputComponentName || createComponentName();
// 		componentInfo.description = res.inputDescription || 'I was created from Strike-CLI';


// 		createAuraDefinitionBundle(componentInfo);
// 	});
// });

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

		switch(process.argv[2]){
			case "fiddleBadge":
				createFiddleBadgeComponent(bundleId);
				break;
			default:
				createComponent(bundleId);
				createComponentController(bundleId);
				createComponentHelper(bundleId);
		}
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
	conn.tooling.sobject('AuraDefinition').create({
		AuraDefinitionBundleId: bundleId,
	    DefType: 'COMPONENT',
	    Format: 'XML',
	    Source: '<aura:component></aura:component>'
	  }, function(err, res) {
	  if (err) { return console.error(err); }
	  console.log(res);
	});
}

function createFiddleBadgeComponent(bundleId){
	conn.tooling.sobject('AuraDefinition').create({
		AuraDefinitionBundleId: bundleId,
	    DefType: 'COMPONENT',
	    Format: 'XML',
	    Source: '<aura:component implements="force:appHostable,flexipage:availableForAllPageTypes" access="global" ><aura:attribute name="label" type="String" default="Badge Label" /><aura:attribute name="class" type="String" /><lightning:layout horizontalAlign="space"><lightning:layoutItem flexibility="spread" padding="around-medium" class="wrap"><div class="container"><lightning:badge label="{!v.label}" class="{!v.class}">{!v.body}</lightning:badge></div></lightning:layoutItem><lightning:layoutItem flexibility="spread" padding="around-medium" class="wrap"><div class="control"><lightning:input name="label" value="{!v.label}" label="Label" /></div></lightning:layoutItem><lightning:layoutItem flexibility="spread" padding="around-medium" class="wrap"><div class="container">&lt;lightning:badge label=&quot;{!v.label}&quot; /&gt;</div></lightning:layoutItem></lightning:layout></aura:component>'
	  }, function(err, res) {
	  if (err) { return console.error(err); }
	  console.log(res);
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
