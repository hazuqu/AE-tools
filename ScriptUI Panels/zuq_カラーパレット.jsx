(function (thisObj) {
    var SCRIPT_NAME = "zuq_カラーパレット";
    var SWATCH_SIZE = 28;
    var SWATCH_GAP = 4;
    var BACKGROUND = [0.13, 0.13, 0.13, 1];
    var SELECTED = [1, 1, 1, 1];
    var TARGET = [1, 0.8, 0, 1];
    var SKIP_HIDDEN_LAYERS = true;

    var colors = [];
    var colorMap = {};
    var selection = [];
    var scrollRow = 0;
    var message = "";

    function toHex(v) {
        var s = "#";
        for (var i = 0; i < 3; i++) {
            var n = Math.round(Math.max(0, Math.min(1, v[i])) * 255);
            s += (n < 16 ? "0" : "") + n.toString(16).toUpperCase();
        }
        return s;
    }

    function overridden(p) {
        if (!p.canSetExpression) return !p.isModified;
        return p.expressionEnabled && p.expression !== "";
    }

    function isHiddenError(err) {
        return String(err).indexOf("hidden") >= 0;
    }

    function slot(p, read, write) {
        var values = [];
        if (p.numKeys > 0) for (var k = 1; k <= p.numKeys; k++) values.push(read(p.keyValue(k)));
        else values.push(read(p.valueAtTime(0, true)));
        return {
            values: values,
            set: function (i, rgb) {
                if (p.numKeys > 0) p.setValueAtKey(i + 1, write(p.keyValue(i + 1), rgb));
                else p.setValue(write(p.valueAtTime(0, true), rgb));
            },
            apply: function (rgb) {
                var time = p.propertyGroup(p.propertyDepth).containingComp.time;
                if (p.numKeys > 0) p.setValueAtTime(time, write(p.valueAtTime(time, true), rgb));
                else p.setValue(write(p.valueAtTime(0, true), rgb));
            }
        };
    }

    var TONER_COLORS = (function () {
        var duo = ["Highlights", "Shadows"], tri = ["Highlights", "Midtones", "Shadows"], penta = ["Highlights", "Brights", "Midtones", "Darktones", "Shadows"], solid = ["Midtones"];
        return { "CC Toner": [duo, tri, penta, [], solid], "HZQ_Toner": [solid, duo, tri, penta] };
    })();

    var SHAPE_COLORS = { "ADBE Vector Graphic - Fill": "ADBE Vector Fill Color", "ADBE Vector Graphic - Stroke": "ADBE Vector Stroke Color" };

    function recolorSolid(layer, rgb) {
        var source = layer.source, comps = source.usedIn, shared = false;
        for (var c = 0; c < comps.length && !shared; c++) {
            for (var l = 1; l <= comps[c].numLayers; l++) {
                var other = comps[c].layer(l);
                if (other.source && other.source.id === source.id &&!(comps[c].id === layer.containingComp.id && other.id === layer.id)) { shared = true; break; }
            }
        }
        if (!shared) {
            source.mainSource.color = rgb;
            return;
        }
        var hex = toHex(rgb);
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof FootageItem && item.mainSource instanceof SolidSource && toHex(item.mainSource.color) === hex
                && item.width === source.width && item.height === source.height && item.pixelAspect === source.pixelAspect) {
                layer.replaceSource(item, false);
                return;
            }
        }
        var temp = layer.containingComp.layers.addSolid(rgb, source.name + " " + hex, source.width, source.height, source.pixelAspect);
        layer.replaceSource(temp.source, false);
        temp.remove();
    }

    function forEachColor(fn, layers) {
        function emit(s, layer, owner) {
            for (var v = 0; v < s.values.length; v++) if (s.values[v]) return fn(s, layer, owner);
        }
        function walkShape(group, layer) {
            for (var i = 1; i <= group.numProperties; i++) {
                var p = group.property(i);
                if (p.propertyType === PropertyType.PROPERTY || !p.enabled) continue;
                if (!SHAPE_COLORS[p.matchName]) walkShape(p, layer);
                else if (!overridden(p.property(SHAPE_COLORS[p.matchName]))) emit(slot(p.property(SHAPE_COLORS[p.matchName]), function (v) { return v; }, function (v, rgb) { return rgb.concat(1); }), layer, p);
            }
        }
        function walk(group, layer, effect, allowed) {
            for (var i = 1; i <= group.numProperties; i++) {
                var p = group.property(i);
                if (p.propertyType !== PropertyType.PROPERTY) walk(p, layer, effect, allowed);
                else if (p.propertyValueType === PropertyValueType.COLOR && !overridden(p) && (!allowed || allowed[p.name])) {
                    emit(slot(p, function (v) { return v; }, function (v, rgb) { return rgb.concat(1); }), layer, effect);
                }
            }
        }
        if (!layers) {
            layers = [];
            for (var i = 1; i <= app.project.numItems; i++) {
                var item = app.project.item(i);
                if (item instanceof CompItem) for (var j = 1; j <= item.numLayers; j++) layers.push(item.layer(j));
            }
        }
        for (var l = 0; l < layers.length; l++) {
            var layer = layers[l];
            if (SKIP_HIDDEN_LAYERS && !layer.enabled) continue;
            var fx = layer.property("ADBE Effect Parade");
            for (var e = 1; fx && e <= fx.numProperties; e++) {
                var effect = fx.property(e), allowed = null;
                if (!effect.enabled) continue;
                if (TONER_COLORS[effect.matchName]) {
                    var names = TONER_COLORS[effect.matchName][effect.property("Tones").value - 1] || [];
                    allowed = {};
                    for (var n = 0; n < names.length; n++) allowed[names[n]] = true;
                }
                walk(effect, layer, effect, allowed);
            }

            var contents = layer.property("ADBE Root Vectors Group");
            if (contents) walkShape(contents, layer);

            var text = layer.property("ADBE Text Properties");
            if (text && !overridden(text.property("ADBE Text Document"))) {
                emit(slot(text.property("ADBE Text Document"),
                    function (doc) { return doc.applyFill ? doc.fillColor : null; },
                    function (doc, rgb) { doc.fillColor = rgb; return doc; }), layer, null);
                emit(slot(text.property("ADBE Text Document"),
                    function (doc) { return doc.applyStroke ? doc.strokeColor : null; },
                    function (doc, rgb) { doc.strokeColor = rgb; return doc; }), layer, null);
            }

            if (layer.source instanceof FootageItem && layer.source.mainSource instanceof SolidSource) {
                var recolor = function (l) { return function (i, rgb) { recolorSolid(l, rgb); }; }(layer);
                emit({ values: [layer.source.mainSource.color], set: recolor, apply: function (rgb) { recolor(0, rgb); } }, layer, null);
            }
        }
    }

    function scan() {
        colors = [];
        colorMap = {};
        forEachColor(function (s, layer) {
            for (var v = 0; v < s.values.length; v++) {
                if (!s.values[v]) continue;
                var hex = toHex(s.values[v]);
                if (!colorMap[hex]) {
                    var r = s.values[v][0], g = s.values[v][1], b = s.values[v][2];
                    var max = Math.max(r, g, b), d = max - Math.min(r, g, b);
                    var h = d < 0.05 ? -1 : (max === r ? ((g - b) / d + 6) % 6 : (max === g ? (b - r) / d + 2 : (r - g) / d + 4));
                    colorMap[hex] = { hex: hex, rgb: [r, g, b], key: (h < 0 ? 0 : 1 + Math.floor(h * 2)) + Math.min(max, 1) * 0.9, layers: {} };
                    colors.push(colorMap[hex]);
                }
                colorMap[hex].layers[layer.containingComp.id + ":" + layer.id] = layer;
            }
        });
        colors.sort(function (a, b) { return a.key - b.key; });
        var kept = [];
        for (var s = 0; s < selection.length; s++) if (colorMap[selection[s]]) kept.push(selection[s]);
        selection = kept;
        refresh();
    }

    function replace(selectedOnly) {
        if (selection.length < 2) return;
        var target = colorMap[selection[selection.length - 1]].rgb, isSource = {}, errors = [], layers;
        for (var s = 0; s < selection.length - 1; s++) isSource[selection[s]] = true;
        if (selectedOnly) {
            layers = app.project.activeItem instanceof CompItem ? app.project.activeItem.selectedLayers : [];
            if (!layers.length) return;
        }
        app.beginUndoGroup(SCRIPT_NAME + (selectedOnly ? " 置換" : " マージ"));
        forEachColor(function (slt, layer) {
            for (var v = 0; v < slt.values.length; v++) {
                if (!slt.values[v] || !isSource[toHex(slt.values[v])]) continue;
                var locked = layer.locked;
                try {
                    if (locked) layer.locked = false;
                    slt.set(v, target);
                } catch (err) {
                    if (!isHiddenError(err)) errors.push(layer.containingComp.name + " / " + layer.name + ": " + err.toString());
                }
                if (locked) layer.locked = true;
            }
        }, layers);
        app.endUndoGroup();
        if (errors.length) alert(errors.length + "個の色を変更できませんでした。\n\n" + errors.slice(0, 8).join("\n"), SCRIPT_NAME);
        selection = [selection[selection.length - 1]];
        scan();
    }

    function propertyKey(p) {
        var key = "";
        for (var q = p; q.parentProperty; q = q.parentProperty) key = q.propertyIndex + "/" + key;
        return p.propertyGroup(p.propertyDepth).id + ":" + key;
    }

    function applyColor(color) {
        var comp = app.project.activeItem;
        if (!(comp instanceof CompItem)) return;
        var props = comp.selectedProperties, owners = {}, layers = [], hasOwner = false, candidates = [];
        for (var i = 0; i < props.length; i++) {
            var p = props[i];
            if (p.parentProperty && SHAPE_COLORS[p.parentProperty.matchName]) p = p.parentProperty;
            if (!SHAPE_COLORS[p.matchName] && !(p.parentProperty && p.parentProperty.matchName === "ADBE Effect Parade" && p.propertyType !== PropertyType.PROPERTY)) continue;
            owners[propertyKey(p)] = true;
            layers.push(p.propertyGroup(p.propertyDepth));
            hasOwner = true;
        }
        forEachColor(function (s, layer, owner) {
            if (!hasOwner || (owner && owners[propertyKey(owner)])) candidates.push({ slot: s, layer: layer });
        }, hasOwner ? layers : comp.selectedLayers);
        var current = {}, kinds = 0;
        for (var c = 0; c < candidates.length; c++) {
            for (var v = 0; v < candidates[c].slot.values.length; v++) {
                var hex = candidates[c].slot.values[v] ? toHex(candidates[c].slot.values[v]) : null;
                if (hex && !current[hex]) { current[hex] = true; kinds++; }
            }
        }
        if (!candidates.length || kinds > 1) {
            message = "入れ先の色が" + candidates.length + "個あり、今の色が" + kinds + "種類あるため入れていません";
            refresh();
            return;
        }
        var done = 0, failed = 0;
        app.beginUndoGroup(SCRIPT_NAME + " 適用");
        for (c = 0; c < candidates.length; c++) {
            var locked = candidates[c].layer.locked;
            if (locked) candidates[c].layer.locked = false;
            try {
                candidates[c].slot.apply(color.rgb);
                done++;
            } catch (err) {
                if (!isHiddenError(err)) failed++;
            }
            if (locked) candidates[c].layer.locked = true;
        }
        app.endUndoGroup();
        message = color.hex + " を" + done + "か所に入れました" + (failed ? "（" + failed + " 失敗）" : "");
        scan();
    }

    function selectLayers(color) {
        var comp = app.project.activeItem, users = [], inActive = false;
        for (var k in color.layers) {
            users.push(color.layers[k]);
            if (comp instanceof CompItem && color.layers[k].containingComp.id === comp.id) inActive = true;
        }
        if (!users.length) return;
        if (!inActive) {
            comp = users[0].containingComp;
            comp.openInViewer();
        }
        for (var l = 1; l <= comp.numLayers; l++) comp.layer(l).selected = false;
        for (var u = 0; u < users.length; u++) if (users[u].containingComp.id === comp.id && !users[u].locked) users[u].selected = true;
    }

    var win = thisObj instanceof Panel ? thisObj : new Window("palette", SCRIPT_NAME, undefined, { resizeable: true });
    win.orientation = "column";
    win.alignChildren = ["fill", "fill"];
    win.spacing = 2;
    win.margins = 4;

    var main = win.add("group");
    main.alignment = ["fill", "fill"];
    main.alignChildren = ["fill", "fill"];
    main.spacing = 4;
    var side = main.add("group");
    side.orientation = "column";
    side.alignment = ["left", "top"];
    side.spacing = 4;
    var scanButton = side.add("button", undefined, "↻");
    var mergeButton = side.add("button", undefined, "↓");
    var replaceButton = side.add("button", undefined, "↩");
    scanButton.preferredSize = mergeButton.preferredSize = replaceButton.preferredSize = [32, 28];
    scanButton.helpTip = "読み込み";
    mergeButton.helpTip = "統合";
    replaceButton.helpTip = "色変え";

    var canvas = main.add("iconbutton", undefined, undefined, { style: "toolbutton" });
    canvas.preferredSize = [(SWATCH_SIZE + SWATCH_GAP) * 8, (SWATCH_SIZE + SWATCH_GAP) * 4];
    canvas.helpTip = "ダブルクリック: 適用\n右クリック: 色を使うレイヤを選択";
    var bar = main.add("scrollbar", undefined, 0, 0, 1);
    bar.alignment = ["right", "fill"];
    bar.preferredSize.width = 16;

    var status = win.add("edittext", undefined, "", { readonly: true });
    status.alignment = ["fill", "bottom"];

    function columns() {
        return Math.max(1, Math.floor((canvas.size[0] - SWATCH_GAP) / (SWATCH_SIZE + SWATCH_GAP)));
    }

    function refresh() {
        var maxRow = Math.max(0, Math.ceil(colors.length / columns()) - Math.floor(canvas.size[1] / (SWATCH_SIZE + SWATCH_GAP)));
        scrollRow = Math.min(scrollRow, maxRow);
        bar.maxvalue = Math.max(maxRow, 1);
        if (bar.value !== scrollRow) bar.value = scrollRow;
        bar.enabled = maxRow > 0;
        var layers = {}, count = 0;
        for (var s = 0; s < selection.length; s++) for (var k in colorMap[selection[s]].layers) if (!layers[k]) { layers[k] = true; count++; }
        var codes = selection.length > 1 ? selection.slice(0, -1).join(" ") + " → " + selection[selection.length - 1] : selection.join("");
        status.text = message || (selection.length ? codes + "　" + count + "レイヤー" : colors.length + "色");
        message = "";
        canvas.hide();
        canvas.show();
    }

    canvas.onDraw = function () {
        var g = this.graphics, cell = SWATCH_SIZE + SWATCH_GAP, cols = columns();
        g.newPath();
        g.rectPath(0, 0, this.size[0], this.size[1]);
        g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, BACKGROUND));
        var order = {};
        for (var s = 0; s < selection.length; s++) order[selection[s]] = s;
        var last = Math.min(colors.length, (scrollRow + Math.ceil(this.size[1] / cell)) * cols);
        for (var i = scrollRow * cols; i < last; i++) {
            var x = (i % cols) * cell + SWATCH_GAP, y = (Math.floor(i / cols) - scrollRow) * cell + SWATCH_GAP;
            g.newPath();
            g.rectPath(x, y, SWATCH_SIZE, SWATCH_SIZE);
            var hex = colors[i].hex, rgb = [];
            for (var c = 0; c < 3; c++) rgb.push((parseInt(hex.substr(1 + c * 2, 2), 16) + 0.5) / 256);
            g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, rgb.concat(1)));
            if (order[colors[i].hex] === undefined) continue;
            var isTarget = order[colors[i].hex] === selection.length - 1;
            g.strokePath(g.newPen(g.PenType.SOLID_COLOR, isTarget ? TARGET : SELECTED, isTarget ? 4 : 2));
        }
    };

    canvas.addEventListener("mousedown", function (e) {
        var cell = SWATCH_SIZE + SWATCH_GAP, cols = columns();
        var col = Math.floor(e.clientX / cell);
        var i = (Math.floor(e.clientY / cell) + scrollRow) * cols + col;
        if (col >= cols || i >= colors.length) {
            selection = [];
            refresh();
            return;
        }
        if (e.button === 2) {
            selection = [colors[i].hex];
            refresh();
            selectLayers(colors[i]);
            return;
        }
        if (e.detail === 2) {
            applyColor(colors[i]);
            return;
        }
        var hex = colors[i].hex;
        if (e.ctrlKey || e.shiftKey || e.metaKey) {
            var found = -1;
            for (var s = 0; s < selection.length; s++) if (selection[s] === hex) found = s;
            if (found >= 0) selection.splice(found, 1);
            else selection.push(hex);
        } else {
            selection = [hex];
        }
        refresh();
    });

    bar.onChanging = function () {
        scrollRow = Math.round(this.value);
        canvas.hide();
        canvas.show();
    };

    scanButton.onClick = scan;
    mergeButton.onClick = function () { replace(false); };
    replaceButton.onClick = function () { replace(true); };

    win.onResizing = win.onResize = function () {
        this.layout.resize();
        refresh();
    };

    if (win instanceof Window) win.show();
    else win.layout.layout(true);
    scan();
})(this);
