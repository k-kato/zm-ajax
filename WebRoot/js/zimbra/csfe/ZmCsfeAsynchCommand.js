/**
* @class ZmCsfeAsynchCommand
* This class executes Csfe commands assynchronously.
* When command is executed (Rpc call returns) all invokeListeners are notified.
* @ constructor
* @author Greg Solovyev
**/

function ZmCsfeAsynchCommand () {
	ZmCsfeCommand.call(this);
	this.invokeListeners = new Array();
	this.commandSoapDoc = "";
	this._responseSoapDoc = null;
	this._st = null; //start time (call sent)
	this._en = null; //end time (call returned)
}

ZmCsfeAsynchCommand.prototype = new ZmCsfeCommand;
ZmCsfeAsynchCommand.prototype.constructor = ZmCsfeAsynchCommand;

ZmCsfeAsynchCommand.prototype.toString = 
function () {
	return 	"ZmCsfeAsynchCommand";
}

/**
* @method addInvokeListener
* @param obj : LsCallback
* use this method to be notified when rpc call returns.
* Callback receives an argument that is either responseSoapDocBody or exceptionObject
* -	_responseSoapDoc:LsSoapDoc is a resonse SOAP document
**/
ZmCsfeAsynchCommand.prototype.addInvokeListener = 
function (obj) {
	this.invokeListeners.push(obj);
}

/**
* @method removeInvokeListener
* @param obj
* use this method to unsubscribe obj from events of this command object
**/
ZmCsfeAsynchCommand.prototype.removeInvokeListener = 
function (obj) {
	var cnt = this.invokeListeners.length;
	var ix = 0;
	for(; ix < cnt; ix++) {
		if (this.invokeListeners[ix] == obj) {
			this.invokeListeners[ix] = null;
			break;
		}
	}
}


ZmCsfeAsynchCommand.prototype._fireInvokeEvent = 
function (exceptionObject) {
	var cnt = this.invokeListeners.length;
	for(var ix = 0; ix < cnt; ix++) {
		if (this.invokeListeners[ix] != null) {
			if(exceptionObject) {
				this.invokeListeners[ix].run(exceptionObject);
			} else {
				if(this._responseSoapDoc) {
					this.invokeListeners[ix].run(this._responseSoapDoc);					
				} else {
					this.invokeListeners[ix].run(new ZmCsfeException("Csfe service error", LsException.UNKNOWN_ERROR, "ZmCsfeAsynchCommand.prototype._fireInvokeEvent", "Service returned empty document"));				
				}
			}
		}
	}
}

/**
* @method rpcCallback
* @param response
* this method is called by XMLHttpRequest object's event handler.
response obejct contains the following properties
text, xml, success, status
**/
ZmCsfeAsynchCommand.prototype.rpcCallback = 
function (response) {
	this._en = new Date();
	DBG.println(LsDebug.DBG1, "<H4>ASYNCHRONOUS REQUEST RETURNED</H4>");
	DBG.println(LsDebug.DBG1, "ASYNCHRONOUS ROUND TRIP TIME: " + (this._en.getTime() - this._st.getTime()));	
	var newEx = null;
	if(!response.success) {
		try {
			var respDoc = LsEnv.isIE || response.xml == null
							? LsSoapDoc.createFromXml(response.text) 
							: LsSoapDoc.createFromDom(response.xml);		
			if(respDoc.getBody()) {
				DBG.println(LsDebug.DBG1, "<H4>RESPONSE</H4>");
				DBG.printXML(LsDebug.DBG1, respDoc.getXml());
			
				var fault = LsSoapDoc.element2FaultObj(respDoc.getBody());
				if (fault) {
					newEx = new ZmCsfeException("Csfe service error", fault.errorCode, "ZmCsfeAsynchCommand.prototype.rpcCallback", fault.reason);
				}		
			} 							
		} catch (ex) {
			newEx =	new ZmCsfeException();
			newEx.method = "ZmCsfeAsynchCommand.prototype.rpcCallback";
			newEx.detail = "Unknown problem ecnountered while communicating to server. ";
			newEx.detail += "text: ";
			newEx.detail += response.text; 
			newEx.detail += "\n";
			newEx.detail += "xml: ";
			newEx.detail += response.xml;		
			newEx.detail += "\n";
			newEx.detail += "status: ";
			newEx.detail += response.status;		
			newEx.detail += "\n";
			newEx.code = ZmCsfeException.UNKNOWN_ERROR;
			newEx.msg = "Unknown Error";
		}
	} else {
		try {
			// responseXML is empty under IE and FF doesnt seem to populate xml if faulted
			var respDoc = LsEnv.isIE || response.xml == null
							? LsSoapDoc.createFromXml(response.text) 
							: LsSoapDoc.createFromDom(response.xml);
			this._responseSoapDoc = respDoc;
			DBG.println(LsDebug.DBG1, "<H4>RESPONSE</H4>");
			DBG.printXML(LsDebug.DBG1, respDoc.getXml());
		} catch (ex) {
			if ((ex instanceof LsSoapException) || (ex instanceof LsException)) {
				newEx =	ex;
			} else {
				newEx =	new ZmCsfeException();
				newEx.method = "ZmCsfeAsynchCommand.prototype.rpcCallback";
				newEx.detail = ex.toString();
				newEx.code = ZmCsfeException.UNKNOWN_ERROR;
				newEx.msg = "Unknown Error";
			}
		}
		try {
			//check if we received a Fault message from server
			var fault = LsSoapDoc.element2FaultObj(this._responseSoapDoc.getBody());
			if (fault) {
				newEx = new ZmCsfeException("Csfe service error", fault.errorCode, "ZmCsfeAsynchCommand.prototype.rpcCallback", fault.reason);
			}
		} catch (ex) {
			newEx = ex;
		}
	}
	//call event listeners
	this._fireInvokeEvent(newEx);
}

ZmCsfeAsynchCommand.prototype.invoke = 
function (soapDoc, noAuthTokenRequired, serverUri, targetServer, useXml) {
	if (!noAuthTokenRequired) {
		var authToken = ZmCsfeCommand.getAuthToken();
		if (authToken == null)
			throw new ZmCsfeException("AuthToken required", ZmCsfeException.NO_AUTH_TOKEN, "ZmCsfeCommand.invoke");
		var sessionId = ZmCsfeCommand.getSessionId();
		var hdr = soapDoc.createHeaderElement();
		var ctxt = soapDoc.set("context", null, hdr);
		ctxt.setAttribute("xmlns", "urn:liquid");
		soapDoc.set("authToken", authToken, ctxt);
		if (sessionId != null)
			soapDoc.set("sessionId", sessionId, ctxt);
		if(targetServer != null)
			soapDoc.set("targetServer", targetServer, ctxt);
	}
	
	if (!useXml) {
		var js = soapDoc.set("format", null, ctxt);
		js.setAttribute("type", "js");
	}
	
	try {
		DBG.println(LsDebug.DBG1, "<H4>ASYNCHRONOUS REQUEST</H4>");
		DBG.printXML(LsDebug.DBG1, soapDoc.getXml());
		var uri = serverUri || ZmCsfeCommand.serverUri;
		var requestStr = !LsEnv.isSafari 
			? soapDoc.getXml() 
			: soapDoc.getXml().replace("soap=", "xmlns:soap=");
			
		this._st = new Date();
		LsRpc.invoke(requestStr, uri,  {"Content-Type": "application/soap+xml; charset=utf-8"}, new LsCallback(this, ZmCsfeAsynchCommand.prototype.rpcCallback)); //asynchronous call returns null 
	} catch (ex) {
		//JavaScript error, network error or unknown error may happen
		var newEx = new ZmCsfeException();
		newEx.method = "ZmCsfeCommand.invoke";
		if (ex instanceof LsException) {
			newEx.detail = ex.msg + ": " + ex.code + " (" + ex.method + ")";
			newEx.msg = "Network Error";
			newEx.code = ex.code;
		} else {
			newEx.detail = ex.toString();
			newEx.code = ZmCsfeException.UNKNOWN_ERROR;
			newEx.msg = "Unknown Error";
		}
		//notify listeners
		this._fireInvokeEvent(newEx);
	}	
}
