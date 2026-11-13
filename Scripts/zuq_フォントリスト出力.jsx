(function() {

    var SORT_BY_COUNT = true;
    var SCAN_PER_CHARACTER = true;
    var SHOW_SOURCE = true;
    var SHOW_LICENSE = true;

    var EXCLUDE_SERVICE_FONTS = true;

    var SKIP_SERVICES = [
        ["fontworks", "LETS"],
        ["morisawa", "モリサワパスポート"],
        ["fonts.google.com", "Google Fonts"],
        ["google.com/get", "Google Fonts"],
        ["adobe.com/type", "Adobe Fonts"],
        ["typekit", "Adobe Fonts"]
    ];

    var LICENSE_OVERRIDE = [
        ["fontworks", "https://lets.fontworks.co.jp/services/license"]
    ];

    if (!app.project) {
        alert("プロジェクト開いて。");
        return;
    }

    var fontCache = {};
    var fonts = collectFonts();
    var names = sortedNames(fonts);

    if (names.length === 0) {
        alert("テキストレイヤーが無かったよ。");
        return;
    }

    var text = buildText(names);
    if (text === "") {
        alert("表に載せるフォントは無かったよ。");
        return;
    }

    showResult(text);

    function collectFonts() {
        var map = {};
        for (var i = 1; i <= app.project.numItems; i++) {
            var comp = app.project.item(i);
            if (!(comp instanceof CompItem)) continue;

            for (var j = 1; j <= comp.numLayers; j++) {
                var layer = comp.layer(j);
                if (!(layer instanceof TextLayer)) continue;

                var used = layerFonts(layer);
                for (var k = 0; k < used.length; k++) map[used[k]] = (map[used[k]] || 0) + 1;
            }
        }
        return map;
    }

    function layerFonts(layer) {
        var source = layer.text.sourceText;
        var docs = [];
        if (source.numKeys > 0) {
            for (var i = 1; i <= source.numKeys; i++) docs.push(source.keyValue(i));
        } else {
            docs.push(source.value);
        }

        var list = [];
        var seen = {};
        for (var d = 0; d < docs.length; d++) {
            var found = docFonts(docs[d]);
            for (var f = 0; f < found.length; f++) {
                if (!found[f] || seen[found[f]]) continue;
                seen[found[f]] = true;
                list.push(found[f]);
            }
        }
        return list;
    }

    function docFonts(doc) {
        if (!SCAN_PER_CHARACTER || typeof doc.characterRange !== "function") return [doc.font];

        var whole = rangeFont(doc, 0, doc.text.length);
        if (whole) return [whole];

        var list = [];
        for (var i = 0; i < doc.text.length; i++) list.push(rangeFont(doc, i, i + 1) || doc.font);
        return list;
    }

    function rangeFont(doc, start, end) {
        try {
            return doc.characterRange(start, end).font || null;
        } catch (e) {
            return null;
        }
    }

    function sortedNames(map) {
        var names = [];
        for (var name in map) names.push(name);

        names.sort(function(a, b) {
            if (SORT_BY_COUNT && map[a] !== map[b]) return map[a] < map[b] ? 1 : -1;
            return displayName(a) < displayName(b) ? -1 : 1;
        });
        return names;
    }

    function buildText(names) {
        var list = [];
        var sources = [];
        var licenses = [];
        for (var i = 0; i < names.length; i++) {
            var detail = detailOf(names[i]);
            if (EXCLUDE_SERVICE_FONTS && detail.service) continue;

            var label = displayName(names[i]);
            list.push(label);
            sources.push(label + " : " + detail.source);
            licenses.push(label + " : " + detail.license);
        }
        if (list.length === 0) return "";

        var text = list.join("\n");
        if (SHOW_SOURCE) text += "\n\n" + sources.join("\n");
        if (SHOW_LICENSE) text += "\n\n" + licenses.join("\n");
        return text;
    }

    function displayName(psName) {
        var font = fontObject(psName);
        return font ? (font.nativeFullName || font.fullName) : psName;
    }

    function fontObject(psName) {
        if (fontCache[psName] !== undefined) return fontCache[psName];

        var found = null;
        try {
            var list = app.fonts.getFontsByPostScriptName(psName);
            if (list && list.length) found = list[0];
        } catch (e) {}
        return fontCache[psName] = found;
    }

    function detailOf(psName) {
        var font = fontObject(psName);
        if (!font) return { source: "未インストール", license: "未インストール" };

        var file = new File(font.location);
        var rec = nameRecords(file);
        return {
            source: rec[11] || rec[12] || rec[8] || rec[9] || (font.isFromAdobeFonts ? "Adobe Fonts" : "不明（" + file.displayName + "）"),
            license: overrideLicense(rec) || rec[14] || oneLine(rec[13]) || "記載なし",
            service: font.isFromAdobeFonts ? "Adobe Fonts" : serviceOf(rec)
        };
    }

    function serviceOf(rec) {
        var url = ((rec[11] || "") + (rec[12] || "")).toLowerCase();
        for (var i = 0; i < SKIP_SERVICES.length; i++) {
            if (url.indexOf(SKIP_SERVICES[i][0]) !== -1) return SKIP_SERVICES[i][1];
        }
        return "";
    }

    function overrideLicense(rec) {
        var maker = ((rec[11] || "") + (rec[12] || "") + (rec[8] || "") + (rec[9] || "")).toLowerCase();
        for (var i = 0; i < LICENSE_OVERRIDE.length; i++) {
            if (maker.indexOf(LICENSE_OVERRIDE[i][0]) !== -1) return LICENSE_OVERRIDE[i][1];
        }
        return "";
    }

    function oneLine(text) {
        if (!text) return "";

        var flat = text.replace(/\s+/g, " ");
        return flat.length > 100 ? flat.substr(0, 100) + "…" : flat;
    }

    function nameRecords(file) {
        file.encoding = "BINARY";
        if (!file.open("r")) return {};

        var head = readAt(file, 0, 16);
        var base = head.substr(0, 4) === "ttcf" ? u32(head, 12) : 0;
        if (base > 0) head = readAt(file, base, 16);

        var dir = readAt(file, base + 12, u16(head, 4) * 16);
        var offset = 0;
        var length = 0;
        for (var i = 0; i * 16 < dir.length; i++) {
            if (dir.substr(i * 16, 4) !== "name") continue;
            offset = u32(dir, i * 16 + 8);
            length = u32(dir, i * 16 + 12);
        }
        if (length === 0) {
            file.close();
            return {};
        }

        var table = readAt(file, offset, length);
        file.close();

        var map = {};
        var strings = u16(table, 4);
        var count = u16(table, 2);
        for (var r = 0; r < count; r++) {
            var rec = 6 + r * 12;
            var nameId = u16(table, rec + 6);
            if (nameId < 8 || nameId > 14 || nameId === 10) continue;

            var platform = u16(table, rec);
            if (platform !== 3 && map[nameId]) continue;
            map[nameId] = decodeRecord(table, strings + u16(table, rec + 10), u16(table, rec + 8), platform);
        }
        return map;
    }

    function readAt(file, position, length) {
        file.seek(position, 0);
        return file.read(length);
    }

    function u16(data, p) {
        return (data.charCodeAt(p) << 8) | data.charCodeAt(p + 1);
    }

    function u32(data, p) {
        return u16(data, p) * 65536 + u16(data, p + 2);
    }

    function decodeRecord(table, start, length, platform) {
        var text = "";
        if (platform === 1) {
            for (var p = start; p < start + length; p++) text += String.fromCharCode(table.charCodeAt(p));
        } else {
            for (var q = start; q + 1 < start + length; q += 2) text += String.fromCharCode(u16(table, q));
        }
        return text;
    }

    function showResult(text) {
        var win = new Window("dialog", "フォントリスト");
        win.alignChildren = "fill";

        var box = win.add("edittext", undefined, text, { multiline: true, scrolling: true });
        box.preferredSize = [560, 400];

        var row = win.add("group");
        row.alignment = "right";
        row.add("button", undefined, "テキストで保存").onClick = function() { saveText(text); };
        row.add("button", undefined, "閉じる", { name: "cancel" });

        win.show();
    }

    function saveText(text) {
        var base = app.project.file ? app.project.file.fsName.replace(/\.aep[x]?$/i, "") : "フォントリスト";
        var file = new File(base + "_フォントリスト.txt").saveDlg("フォントリストの保存先");
        if (!file) return;

        file.encoding = "UTF-8";
        file.open("w");
        file.write("﻿" + text);
        file.close();
    }

})();
