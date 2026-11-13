(function() {

    var COLOR_STEPS = 255;
    var MATCH_SIZE = true;

    if (!app.project) {
        alert("プロジェクト開いて。");
        return;
    }

    var users = collectUsers();
    var groups = groupSolids();

    app.beginUndoGroup("同色平面のマージ");

    var removed = 0;
    var replaced = 0;
    var groupCount = 0;

    for (var key in groups) {
        var group = groups[key];
        if (group.length < 2) continue;
        groupCount++;

        var keeper = mostUsed(group);
        for (var i = 0; i < group.length; i++) {
            if (group[i] === keeper) continue;
            replaced += retarget(group[i], keeper);
            if (group[i].usedIn.length === 0) {
                group[i].remove();
                removed++;
            }
        }
    }

    app.endUndoGroup();

    alert(removed === 0
        ? "まとめられる平面は無かったよ。"
        : "平面 " + removed + " 枚を消して " + groupCount + " 枚にまとめたよ。\nレイヤー " + replaced + " 枚を差し替え。");

    function groupSolids() {
        var map = {};
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (!(item instanceof FootageItem) || !(item.mainSource instanceof SolidSource)) continue;

            var color = item.mainSource.color;
            var key = Math.round(color[0] * COLOR_STEPS) + "," + Math.round(color[1] * COLOR_STEPS) + "," + Math.round(color[2] * COLOR_STEPS);
            if (MATCH_SIZE) key += "|" + item.width + "x" + item.height + "|" + item.pixelAspect;

            if (!map[key]) map[key] = [];
            map[key].push(item);
        }
        return map;
    }

    function collectUsers() {
        var map = {};
        for (var i = 1; i <= app.project.numItems; i++) {
            var comp = app.project.item(i);
            if (!(comp instanceof CompItem)) continue;

            for (var j = 1; j <= comp.numLayers; j++) {
                var layer = comp.layer(j);
                if (!(layer instanceof AVLayer) || !layer.source || !(layer.source.mainSource instanceof SolidSource)) continue;

                if (!map[layer.source.id]) map[layer.source.id] = [];
                map[layer.source.id].push(layer);
            }
        }
        return map;
    }

    function mostUsed(group) {
        var best = group[0];
        var bestCount = users[best.id] ? users[best.id].length : 0;
        for (var i = 1; i < group.length; i++) {
            var count = users[group[i].id] ? users[group[i].id].length : 0;
            if (count > bestCount) {
                best = group[i];
                bestCount = count;
            }
        }
        return best;
    }

    function retarget(from, keeper) {
        var layers = users[from.id];
        if (!layers) return 0;

        for (var i = 0; i < layers.length; i++) {
            var name = layers[i].name;
            layers[i].replaceSource(keeper, false);
            if (layers[i].name !== name) layers[i].name = name;
        }
        return layers.length;
    }

})();
