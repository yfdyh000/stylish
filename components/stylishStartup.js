"use strict";

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
try {
	Components.utils.import("resource://gre/modules/AddonManager.jsm");
} catch (ex) {}
var observerService = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
var bundle = Components.classes["@mozilla.org/intl/stringbundle;1"].createInstance(Components.interfaces.nsIStringBundleService).createBundle("chrome://stylish/locale/manage.properties");

function StylishStartup() {}

StylishStartup.prototype = {
	classID: Components.ID("{6ff9ed70-e673-11dc-95ff-0800200c9a66}"),
	contractID: "@stylish/startup;2",
	classDescription: "Stylish Startup",

	QueryInterface: XPCOMUtils.generateQI([Components.interfaces.nsISupports, Components.interfaces.nsIObserver]),

	observe: function(aSubject, aTopic, aData) {
		var service = Components.classes["@userstyles.org/style;1"].getService(Components.interfaces.stylishStyle);
		service.findEnabled(true, service.REGISTER_STYLE_ON_LOAD, {});
		if (typeof AddonManagerPrivate != "undefined") {
			AddonManagerPrivate.registerProvider(UserStyleManager, [{
				id: "userstyle",
				name: bundle.GetStringFromName("manageaddonstitle"),
				uiPriority: 4600,
				viewType: AddonManager.VIEW_TYPE_LIST
			}]);
		}
		wireUpMessaging();
	}
}

var turnOnOffObserver = {
	observe: function(subject, topic, data) {
		var service = Components.classes["@userstyles.org/style;1"].getService(Components.interfaces.stylishStyle);
		service.findEnabled(true, subject.QueryInterface(Components.interfaces.nsIPrefBranch).getBoolPref(data) ? service.REGISTER_STYLE_ON_LOAD : service.UNREGISTER_STYLE_ON_LOAD, {});
	}
}

var prefService = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);

var UserStyleManager = {

	getAddonsByTypes: function(aTypes, aCallback) {
		if (aTypes && aTypes.indexOf("userstyle") == -1) {
			aCallback([]);
			return;
		}
		var service = Components.classes["@userstyles.org/style;1"].getService(Components.interfaces.stylishStyle);
		var styles = service.list(service.REGISTER_STYLE_ON_CHANGE, {});
		aCallback(styles.map(getUserStyleWrapper));
	},

	getAddonByID: function(id, callback) {
		var service = Components.classes["@userstyles.org/style;1"].getService(Components.interfaces.stylishStyle);
		var style = service.find(id, service.REGISTER_STYLE_ON_CHANGE);
		if (style == null) {
			callback(null);
			return;
		}
		callback(getUserStyleWrapper(style));
	},

	getInstallForURL: function(url, callback, mimetype, hash, name, iconURL, version, loadGroup) {
		Components.utils.reportError("getInstallForURL not implemented for user styles.");
		throw "Not implemented";
	},

	getInstallForFile: function(file, callback, mimetype) {
		Components.utils.reportError("getInstallForFile not implemented for user styles.");
		throw "Not implemented";
	},

	getAllInstalls: function(callback) {
		callback(pendingUpdates);
	},

	getInstallsByTypes: function(types, callback) {
		callback(pendingUpdates);
	},

	installAddonsFromWebpage: function(mimetype, source, uri, installs) {
		Components.utils.reportError("installAddonsFromWebpage not implemented for user styles.");
		throw "Not implemented";
	},

	addInstallListener: function(listener) {
		Components.utils.reportError("addInstallListener not implemented for user styles.");
		throw "Not implemented";
	},
	
	removeInstallListener: function(listener) {
		Components.utils.reportError("removeInstallListener not implemented for user styles.");
		throw "Not implemented";
	},

	getAllAddons: function(callback) {
		Components.utils.reportError("getAllAddons not implemented for user styles.");
		throw "Not implemented";
	},

	getAddonsByIDs: function(ids, callback) {
		Components.utils.reportError("getAddonsByIDs not implemented for user styles.");
		throw "Not implemented";
	},

	getAddonsWithOperationsByTypes: function(types, callback) {
		Components.utils.reportError("getAddonsWithOperationsByTypes not implemented for user styles.");
		throw "Not implemented";
	},

	addAddonListener: function(listener) {
		Components.utils.reportError("addAddonListener not implemented for user styles.");
		throw "Not implemented";
	},

	removeAddonListener: function(listener) {
		Components.utils.reportError("removeAddonListener not implemented for user styles.");
		throw "Not implemented";
	}
};

function getUserStyleWrapper(s) {
	var w = {
		style: s,
		type: "userstyle",
		appDisabled: false,
		pendingOperations: AddonManager.PENDING_NONE,
		isCompatible: true,
		isPlatformCompatible: true,
		iconURL: "chrome://stylish/skin/32.png",
		scope: AddonManager.SCOPE_PROFILE,
		blocklistState: Components.interfaces.nsIBlocklistService.STATE_NOT_BLOCKED,
		version: "",
		operationsRequiringRestart: AddonManager.OP_NEEDS_RESTART_NONE,

		get id() {
			return this.style.id.toString();
		},

		get name() {
			return this.style.name;
		},

		get homepageURL() {
			return this.style.url;
		},

		get size() {
			return this.style.code.length;
		},

		get providesUpdatesSecurely() {
			return this.style.updateUrl == null || this.style.updateUrl == "";
		},

		get styleTypes() {
			return this.style.getTypes({}).sort().join(",");
		},

		get optionsURL() {
			return null;
		},

		get permissions() {
			return AddonManager.PERM_CAN_UNINSTALL | 
				(this.style.enabled ? AddonManager.PERM_CAN_DISABLE : AddonManager.PERM_CAN_ENABLE) |
				(this.style.updateUrl != null && this.style.updateUrl != "" && this.style.updateUrl.length <= 2000 && prefService.getBoolPref("extensions.stylish.updatesEnabled") ? AddonManager.PERM_CAN_UPGRADE : 0); // if the url length is too long, a GET won't work, and it's probably going to be too much server-side to handle
		},

		get isActive() {
			return !this.userDisabled;
		},

		get userDisabled() {
			return !this.style.enabled;
		},

		set userDisabled(val) {
			if (this.style.enabled == !val) {
				// no op
				return;
			}
			this.style.enabled = !val;
			this.style.save();
			AddonManagerPrivate.callAddonListeners(val ? "onEnabling" : "onDisabling", this, false);
		},

		get description() {
			return this.getAppliesString();
		},

		getAppliesString: function() {
			var types = this.style.getTypes({});
			if (types.length == 1) {
				if (types[0] == "global") {
					return bundle.GetStringFromName("globalstyledescription");
				}
				if (types[0] == "app") {
					return bundle.GetStringFromName("appstyledescription");
				}
			}
			var affects = this.style.getPrettyAppliesTo({});
			if (affects.length > 0) {
				return bundle.formatStringFromName("sitestyledescription", [affects.join(", ")], 1);
			}
			return "";
		},

		uninstall: function() {
			this.style.delete();
		},

		findUpdates: function(listener, flags) {
			this.style.checkForUpdates(getUserStyleUpdateCheckObserver(this, listener));
		},

		isCompatibleWith: function(appVersion, platformVersion) {
			return true;
		},

		get applyBackgroundUpdates() {
			return prefService.getBoolPref("extensions.stylish.updatesEnabled") ?
			parseInt(this.style.applyBackgroundUpdates) : 0;
		},

		set applyBackgroundUpdates(abu) {
			this.style.applyBackgroundUpdates = abu;
			this.style.save();
		},

		observe: function(subject, topic, data) {
			// Update our stuff if the style was changed
			if (this.style.id == subject.id) {
				this.style = subject;
			}
		}
	};
	var observerService = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
	observerService.addObserver(w, "stylish-style-change", false);
	return w;
}

// An observer for style update checks.
function getUserStyleUpdateCheckObserver(addonItem, listener) {
	return {
		addonItem: addonItem,
		listener: listener,
		observe: function(subject, topic, data) {
			var mainUpdateObject = this;
			if (subject.id == this.addonItem.id) {
				// Results of "check for updates"
				switch (topic) {
					case "stylish-style-update-check-done":
						if (data == "update-available" && "onUpdateAvailable" in this.listener) {
							var installItem = getUserStyleUpdateInstallItem(this.addonItem);
							if (!pendingUpdates.some(function(item) {
								return item.addon.id == installItem.addon.id;
							})) {
								pendingUpdates.push(installItem);
							}
							mainUpdateObject.listener.onUpdateAvailable(mainUpdateObject.addonItem, installItem);
							AddonManagerPrivate.callInstallListeners("onNewInstall", [], installItem);
						} else if ((data == "no-update-available" || data == "update-check-error") && "onNoUpdateAvailable" in this.listener) {
							mainUpdateObject.listener.onNoUpdateAvailable(mainUpdateObject.addonItem);
						}
						if ("onUpdateFinished" in mainUpdateObject.listener) {
							mainUpdateObject.listener.onUpdateFinished(mainUpdateObject.addonItem, (data == "update-available" || data == "no-update-available") ? AddonManager.UPDATE_STATUS_NO_ERROR : AddonManager.UPDATE_STATUS_DOWNLOAD_ERROR);
						}
				}
			}
		}
	}
}

// Returns an InstallItem representing an update to the user style
function getUserStyleUpdateInstallItem(addonItem) {
	return {
		name: addonItem.name,
		type: "userstyle",
		state: AddonManager.STATE_AVAILABLE,
		addon: addonItem,
		existingAddon: addonItem,
		listeners: [],
		install: function() {
			this.listeners.forEach(function(l) {
				if ("onInstallStarted" in l) {
					l.onInstallStarted(this, this.addon);
				}
			}, this);
			var service = Components.classes["@userstyles.org/style;1"].getService(Components.interfaces.stylishStyle);
			var that = this;

			// Results for "apply updates"
			var updateAttemptObserver = {
				observe: function(subject, topic, data) {
					if (topic != "stylish-style-update-done") {
						return;
					}
					switch (data) {
						case "update-failure":
						case "no-update-possible":
							// This is what XPIProvider.jsm does, but for some reason this isn't giving us the right message in the addons manager on an individual check.
							that.state = AddonManager.STATE_DOWNLOAD_FAILED;
							that.error = AddonManager.ERROR_FILE_ACCESS;
							AddonManagerPrivate.callInstallListeners("onDownloadFailed", that.listeners, that);
							break;
						case "update-success":
							AddonManagerPrivate.callInstallListeners("onInstallEnded", that.listeners, that, that.addon);
							break;
					}

					pendingUpdates = pendingUpdates.filter(function(item) {
						return item.addon.id != this.addon.id;
					}, that);
				}
			}
			service.find(this.existingAddon.id, service.CALCULATE_META | service.REGISTER_STYLE_ON_CHANGE).applyUpdate(updateAttemptObserver);
		},
		cancel: function() {
			throw "Cancelling updates not implemented.";
		},
		addListener: function(listener) {
			if (this.listeners.indexOf(listener) == -1) {
				this.listeners.push(listener);
			}
		},
		removeListener: function(listener) {
			this.listeners = this.listeners.filter(function(l) {
				return l != listener;
			});
		}
	}

}

var pendingUpdates = [];


var addonsObserver = {
	observe: function(subject, topic, data) {
		var itemWrapper = getUserStyleWrapper(subject);
		switch (topic) {
			case "stylish-style-add":
				var install = {
					name: subject.name,
					type: "userstyle",
					state: AddonManager.STATE_INSTALLED,
					addon: itemWrapper
				};
				AddonManagerPrivate.callInstallListeners("onNewInstall", [], install);
				AddonManagerPrivate.callInstallListeners("onInstallStarted", [], install);
				AddonManagerPrivate.callInstallListeners("onInstallEnded", [], install, itemWrapper);
				break;
			case "stylish-style-change":
				AddonManagerPrivate.callInstallListeners("onExternalInstall", [], itemWrapper, itemWrapper, false);
				break;
			case "stylish-style-delete":
				AddonManagerPrivate.callAddonListeners("onUninstalled", itemWrapper);
				break;
		}
	}
}
var observerService = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
observerService.addObserver(addonsObserver, "stylish-style-add", false);
observerService.addObserver(addonsObserver, "stylish-style-change", false);
observerService.addObserver(addonsObserver, "stylish-style-delete", false);

Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).QueryInterface(Components.interfaces.nsIPrefBranch).addObserver("extensions.stylish.styleRegistrationEnabled", turnOnOffObserver, false);

function wireUpMessaging() {
	Components.utils.import("chrome://stylish/content/common.js");
	var service = Components.classes["@userstyles.org/style;1"].getService(Components.interfaces.stylishStyle);
	var STRINGS = Components.classes["@mozilla.org/intl/stringbundle;1"].getService(Components.interfaces.nsIStringBundleService).createBundle("chrome://stylish/locale/overlay.properties");

	var globalMM = Components.classes["@mozilla.org/globalmessagemanager;1"].getService(Components.interfaces.nsIMessageListenerManager);
	globalMM.loadFrameScript("chrome://stylish/content/install-frame-script.js", true);

	function reply(incomingMessage, name, data) {
		incomingMessage.target.messageManager.sendAsyncMessage(name, data);
	}

	function messageToWindow(message) {
		return message.target.ownerDocument.defaultView;
	}

	globalMM.addMessageListener("stylish:get-style-install-status", function(message) {
		var style = service.findByUrl(message.data.idUrl, 0);
		if (style) {
			if (style.originalMd5 == message.data.md5) {
				reply(message, "stylish:style-already-installed");
			} else {
				reply(message, "stylish:style-can-be-updated");
			}
		} else {
			reply(message, "stylish:style-can-be-installed");
		}
	});

	globalMM.addMessageListener("stylish:install-style", function(message) {
		stylishCommon.installFromStyleInfo(message.data, function(result) {
			if (result == "installed") {
				reply(message, "stylish:style-installed");
			}
		}, messageToWindow(message));
	});

	globalMM.addMessageListener("stylish:update-style", function(message) {
		var style = service.findByUrl(message.data.idUrl, service.REGISTER_STYLE_ON_CHANGE + service.CALCULATE_META);
		var code = message.data.code;
		var md5 = message.data.md5;
		var md5Url = message.data.md5Url;
		var updateUrl = message.data.updateUrl;
		if (!style || !code) {
			return;
		}
		var prompt = STRINGS.formatStringFromName("updatestyle", [style.name], 1);
		var prompts = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService);
		if (prompts.confirmEx(messageToWindow(message), STRINGS.formatStringFromName("updatestyletitle", [], 0), prompt, prompts.BUTTON_POS_0 * prompts.BUTTON_TITLE_IS_STRING + prompts.BUTTON_POS_1 * prompts.BUTTON_TITLE_CANCEL, STRINGS.formatStringFromName("updatestyleok", [], 0), null, null, null, {}) == 0) {
			style.code = code;

			//we're now in sync with the remote style, so let's set things appropriately
			style.originalCode = code;
			style.md5Url = md5Url;
			style.originalMd5 = md5;
			style.updateUrl = updateUrl;

			style.save();
			reply(message, "stylish:style-updated");
		}
	});

}

if (XPCOMUtils.generateNSGetFactory)
    var NSGetFactory = XPCOMUtils.generateNSGetFactory([StylishStartup]);
else
    var NSGetModule = XPCOMUtils.generateNSGetModule([StylishStartup]);
