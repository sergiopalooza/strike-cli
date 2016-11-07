var jsforce = require('jsforce');
var conn = new jsforce.Connection();

var username = process.env.SF_STRIKE_USERNAME;
var password = process.env.SF_STRIKE_PASSWORD;


conn.login(username, password, function(err, res) {
	if (err) { return console.error(err); }
	var componentName = createComponentName();
	createAuraDefinitionBundle(componentName);
});

function createAuraDefinitionBundle(componentName){
	conn.tooling.sobject('AuraDefinitionBundle').create({
		Description: 'I was created from Strike-CLI', // my description
	  	DeveloperName: componentName,
	  	MasterLabel: componentName, 
	  	ApiVersion:'32.0'
	}, 	function(err, res){
		if (err) { return console.error(err); }
		console.log(res);

		var bundleId = res.id;

		createComponentApplication(bundleId);
		createComponentController(bundleId);
		createComponentHelper(bundleId);
	});
}

function createComponentApplication(bundleId){
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
	console.log(componentName);
	return componentName;
}
