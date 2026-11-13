(function (thisObj) {
    var SCRIPT_NAME = "zuq_エフェクトパレット";
    var CHECK_INTERVAL_MS = 1000;
    var SETTINGS_SECTION = "zuqEffectPalette";
    var OTHER_CATEGORY = "その他";

    var usage = {};
    var meta = {};
    var seen = {};
    var seenComps = {};
    var projectTotals = {};
    var lastCheck = 0;
    var dirty = true;
    var signature = "";
    if (app.settings.haveSetting(SETTINGS_SECTION, "usage")) {
        var saved = app.settings.getSetting(SETTINGS_SECTION, "usage").split("\n");
        for (var s = 0; s < saved.length; s++) {
            var cols = saved[s].split("\t");
            if (!cols[0]) continue;
            usage[cols[0]] = Number(cols[1]);
            if (cols[2]) meta[cols[0]] = { name: cols[2], category: cols[3] || OTHER_CATEGORY };
        }
    }

    if (app.settings.haveSetting(SETTINGS_SECTION, "effects")) {
        var known = app.settings.getSetting(SETTINGS_SECTION, "effects").split("\n");
        for (var k = 0; k < known.length; k++) {
            var parts = known[k].split("\t");
            if (parts[0] && !meta[parts[0]]) meta[parts[0]] = { name: parts[1], category: parts[2] || OTHER_CATEGORY };
        }
    } else {
        var all = [], effects = app.effects;
        for (var e = 0; e < effects.length; e++) {
            var info = effects[e], category = info.category || OTHER_CATEGORY;
            meta[info.matchName] = { name: info.displayName, category: category };
            all.push(info.matchName + "\t" + info.displayName + "\t" + category);
        }
        app.settings.saveSetting(SETTINGS_SECTION, "effects", all.join("\n"));
    }

    var win = thisObj instanceof Panel ? thisObj : new Window("palette", SCRIPT_NAME, undefined, { resizeable: true });
    win.orientation = "column";
    win.alignChildren = ["fill", "fill"];
    win.margins = 8;
    var tree = win.add("treeview");
    tree.preferredSize = [200, 400];

    function render(build) {
        if (!dirty) return;
        dirty = false;
        var groups = {}, order = [], lines = [], m, g, i;
        for (m in usage) {
            if (!meta[m]) meta[m] = { name: m, category: OTHER_CATEGORY };
            lines.push(m + "\t" + usage[m] + "\t" + meta[m].name + "\t" + meta[m].category);
            if (!groups[meta[m].category]) {
                groups[meta[m].category] = { name: meta[m].category, effects: [] };
                order.push(groups[meta[m].category]);
            }
            groups[meta[m].category].effects.push(m);
        }
        app.settings.saveSetting(SETTINGS_SECTION, "usage", lines.join("\n"));
        order.sort(function (a, b) { return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1; });
        var next = [];
        for (g = 0; g < order.length; g++) {
            order[g].effects.sort(function (a, b) { return meta[a].name.toLowerCase() < meta[b].name.toLowerCase() ? -1 : 1; });
            next.push(order[g].name + ":" + order[g].effects.join(","));
        }
        if (next.join("|") === signature) return;
        signature = next.join("|");
        if (build === false) return;

        var expanded = {};
        for (i = 0; i < tree.items.length; i++) expanded[tree.items[i].text] = tree.items[i].expanded;
        tree.removeAll();
        for (g = 0; g < order.length; g++) {
            var node = tree.add("node", order[g].name);
            for (i = 0; i < order[g].effects.length; i++) {
                var item = node.add("item", meta[order[g].effects[i]].name);
                item.matchName = order[g].effects[i];
            }
            node.expanded = expanded[order[g].name] === true;
        }
    }

    function check(comp) {
        if (!(comp instanceof CompItem)) return;
        var known = seenComps[comp.id];
        seenComps[comp.id] = true;
        for (var l = 1; l <= comp.numLayers; l++) {
            var fx = comp.layer(l).property("ADBE Effect Parade"), counts = {};
            for (var j = 1; fx && j <= fx.numProperties; j++) {
                counts[fx.property(j).matchName] = (counts[fx.property(j).matchName] || 0) + 1;
                if (!meta[fx.property(j).matchName]) meta[fx.property(j).matchName] = { name: fx.property(j).name, category: OTHER_CATEGORY };
            }
            var prev = seen[comp.layer(l).id] || {};
            seen[comp.layer(l).id] = counts;
            for (var m in counts) {
                if (!known) {
                    projectTotals[m] = (projectTotals[m] || 0) + counts[m];
                    if (projectTotals[m] <= (usage[m] || 0)) continue;
                    usage[m] = projectTotals[m];
                } else {
                    if (counts[m] <= (prev[m] || 0)) continue;
                    usage[m] = (usage[m] || 0) + counts[m] - (prev[m] || 0);
                }
                dirty = true;
            }
        }
    }

    function onHover() {
        var now = new Date().getTime();
        if (now - lastCheck < CHECK_INTERVAL_MS) return;
        lastCheck = now;
        check(app.project.activeItem);
        render();
    }

    function later(fn) {
        $.global.zuqEffectPaletteLater = fn;
        app.scheduleTask("$.global.zuqEffectPaletteLater()", 0, false);
    }

    function rebuildNode(name, skip) {
        for (var i = 0; i < tree.items.length; i++) {
            if (tree.items[i].text !== name) continue;
            var kids = [];
            for (var c = 0; c < tree.items[i].items.length; c++) if (tree.items[i].items[c].matchName !== skip) kids.push(tree.items[i].items[c].matchName);
            tree.remove(tree.items[i]);
            if (!kids.length) return;
            var node = tree.add("node", name, i);
            for (c = 0; c < kids.length; c++) node.add("item", meta[kids[c]].name).matchName = kids[c];
            return;
        }
    }

    tree.onChange = function () {
        var item = this.selection;
        if (!item) return;
        this.selection = null;
        if (item.type === "node") {
            var closing = [];
            for (var n = 0; n < this.items.length; n++) if (this.items[n].expanded && (this.items[n].text !== item.text || item.expanded)) closing.push(this.items[n].text);
            if (!item.expanded) item.expanded = true;
            later(function () {
                for (var c = 0; c < closing.length; c++) rebuildNode(closing[c]);
            });
            return;
        }
        if (ScriptUI.environment.keyboardState.ctrlKey) {
            var category = item.parent.text, removed = item.matchName;
            delete usage[removed];
            later(function () {
                rebuildNode(category, removed);
                for (var c = 0; c < tree.items.length; c++) if (tree.items[c].text === category) tree.items[c].expanded = true;
                dirty = true;
                render(false);
            });
            return;
        }
        var comp = app.project.activeItem;
        if (!(comp instanceof CompItem)) return;
        app.beginUndoGroup(SCRIPT_NAME);
        for (var i = 0; i < comp.selectedLayers.length; i++) {
            var fx = comp.selectedLayers[i].property("ADBE Effect Parade");
            if (fx && fx.canAddProperty(item.matchName)) fx.addProperty(item.matchName);
        }
        app.endUndoGroup();
        check(comp);
    };
    tree.addEventListener("mouseout", onHover);
    win.addEventListener("mouseover", function (e) {
        if (e.target === win) onHover();
    });

    if ($.global.zuqEffectPaletteTask) app.cancelTask($.global.zuqEffectPaletteTask);
    win.onResizing = win.onResize = function () {
        this.layout.resize();
    };
    render();
    if (win instanceof Window) win.show();
    else win.layout.layout(true);
})(this);
