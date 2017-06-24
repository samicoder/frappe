// Copyright (c) 2015, Frappe Technologies Pvt. Ltd. and Contributors
// MIT License. See license.txt

frappe.provide("frappe.ui.form.handlers");

frappe.ui.form.get_event_handler_list = function(doctype, fieldname) {
	if(!frappe.ui.form.handlers[doctype]) {
		frappe.ui.form.handlers[doctype] = {};
	}
	if(!frappe.ui.form.handlers[doctype][fieldname]) {
		frappe.ui.form.handlers[doctype][fieldname] = [];
	}
	return frappe.ui.form.handlers[doctype][fieldname];
}

frappe.ui.form.on = frappe.ui.form.on_change = function(doctype, fieldname, handler) {
	var add_handler = function(fieldname, handler) {
		var handler_list = frappe.ui.form.get_event_handler_list(doctype, fieldname);
		handler_list.push(handler);

		// add last handler to events so it can be called as
		// frm.events.handler(frm)
		if(cur_frm && cur_frm.doctype===doctype) {
			cur_frm.events[fieldname] = handler;
		}
	}

	if (!handler && $.isPlainObject(fieldname)) {
		// a dict of handlers {fieldname: handler, ...}
		for (var key in fieldname) {
			var fn = fieldname[key];
			if (typeof fn === "function") {
				add_handler(key, fn);
			}
		}
	} else {
		add_handler(fieldname, handler);
	}
}

// remove standard event handlers
frappe.ui.form.off = function(doctype, fieldname, handler) {
	var handler_list = frappe.ui.form.get_event_handler_list(doctype, fieldname);
	if(handler_list.length) {
		frappe.ui.form.handlers[doctype][fieldname] = [];
	}

	if(cur_frm && cur_frm.doctype===doctype && cur_frm.events[fieldname]) {
		delete cur_frm.events[fieldname];
	}

	if(cur_frm && cur_frm.cscript && cur_frm.cscript[fieldname]) {
		delete cur_frm.cscript[fieldname];
	}
}


frappe.ui.form.trigger = function(doctype, fieldname, callback) {
	cur_frm.script_manager.trigger(fieldname, doctype, null, callback);
}

frappe.ui.form.ScriptManager = Class.extend({
	init: function(opts) {
		$.extend(this, opts);
	},
	make: function(ControllerClass) {
		this.frm.cscript = $.extend(this.frm.cscript, new ControllerClass({frm: this.frm}));
	},
	trigger: function(event_name, doctype, name, callback) {
		var me = this;
		doctype = doctype || this.frm.doctype;
		name = name || this.frm.docname;
		var handlers = this.get_handlers(event_name, doctype, name, callback);
		if(callback) handlers.push(callback);

		this.frm.selected_doc = frappe.get_doc(doctype, name);

		return $.when.apply($, $.map(handlers, function(fn) { return fn(); }));
	},
	get_handlers: function(event_name, doctype, name, callback) {
		var handlers = [];
		var me = this;
		if(frappe.ui.form.handlers[doctype] && frappe.ui.form.handlers[doctype][event_name]) {
			$.each(frappe.ui.form.handlers[doctype][event_name], function(i, fn) {
				handlers.push(function() { return fn(me.frm, doctype, name) });
			});
		}
		if(this.frm.cscript[event_name]) {
			handlers.push(function() { return me.frm.cscript[event_name](me.frm.doc, doctype, name); });
		}
		if(this.frm.cscript["custom_" + event_name]) {
			handlers.push(function() { return me.frm.cscript["custom_" + event_name](me.frm.doc, doctype, name); });
		}
		return handlers;
	},
	setup: function() {
		var doctype = this.frm.meta;
		var me = this;

		// js
		var cs = doctype.__js;
		if(cs) {
			var tmp = eval(cs);
		}

		if(doctype.__custom_js) {
			try {
				eval(doctype.__custom_js)
			} catch(e) {
				frappe.msgprint({
					title: __('Error in Custom Script'),
					indicator: 'orange',
					message: '<pre class="small"><code>' + e.stack  + '</code></pre>'
				});
			}
		}

		function setup_add_fetch(df) {
			if((['Data', 'Read Only', 'Text', 'Small Text',
				'Text Editor', 'Code'].includes(df.fieldtype) || df.read_only==1)
				&& df.options && df.options.indexOf(".")!=-1) {
				var parts = df.options.split(".");
				me.frm.add_fetch(parts[0], parts[1], df.fieldname);
			}
		}

		// setup add fetch
		$.each(this.frm.fields, function(i, field) {
			setup_add_fetch(field.df);
			if(field.df.fieldtype==="Table") {
				$.each(frappe.meta.get_docfields(field.df.options, me.frm.docname), function(i, df) {
					setup_add_fetch(df);
				});
			}
		});

		// css
		doctype.__css && frappe.dom.set_style(doctype.__css);

		this.trigger('setup');
	},
	log_error: function(caller, e) {
		frappe.show_alert("Error in Client Script.");
		console.group && console.group();
		console.log("----- error in client script -----");
		console.log("method: " + caller);
		console.log(e);
		console.log("error message: " + e.message);
		console.trace && console.trace();
		console.log("----- end of error message -----");
		console.group && console.groupEnd();
	},
	copy_from_first_row: function(parentfield, current_row, fieldnames) {
		var data = this.frm.doc[parentfield];
		if(data.length===1 || data[0]===current_row) return;

		if(typeof fieldnames==='string') {
			fieldnames = [fieldnames];
		}

		$.each(fieldnames, function(i, fieldname) {
			frappe.model.set_value(current_row.doctype, current_row.name, fieldname,
				data[0][fieldname]);
		});
	}
});
