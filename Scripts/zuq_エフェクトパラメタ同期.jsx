(function() {
    var EPSILON = 1e-6;

    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem) || comp.selectedLayers.length < 2) {
        alert("2つ以上のレイヤーを選択してください");
        return;
    }

    app.beginUndoGroup("エフェクトパラメタ同期");

    var selectedLayers = comp.selectedLayers;
    var baseLayer = selectedLayers[0];
    for (var i = 1; i < selectedLayers.length; i++) {
        if (selectedLayers[i].index > baseLayer.index) {
            baseLayer = selectedLayers[i];
        }
    }
    var baseEffects = baseLayer.property("ADBE Effect Parade");

    function findBaseEffect(effects, idx) {
        var matchName = effects.property(idx).matchName;
        var n = 0;
        for (var i = 1; i <= idx; i++) {
            if (effects.property(i).matchName === matchName) n++;
        }
        for (var i = 1; i <= baseEffects.numProperties; i++) {
            if (baseEffects.property(i).matchName === matchName && --n === 0) return i;
        }
        return 0;
    }

    var syncTypes = [
        PropertyValueType.OneD, PropertyValueType.TwoD, PropertyValueType.TwoD_SPATIAL,
        PropertyValueType.ThreeD, PropertyValueType.ThreeD_SPATIAL, PropertyValueType.COLOR
    ];

    function compareSigns(a, b) {
        if (!(a instanceof Array)) { a = [a]; b = [b]; }
        var signs = [];
        for (var i = 0; i < a.length; i++) {
            if (Math.abs(a[i] - b[i]) < EPSILON) signs.push(1);
            else if (Math.abs(a[i] + b[i]) < EPSILON) signs.push(-1);
            else return null;
        }
        return signs;
    }

    function collect(target, base, path, ref, results) {
        for (var i = 1; i <= target.numProperties && i <= base.numProperties; i++) {
            var tp = target.property(i);
            var bp = base.property(i);
            var subPath = path.concat([i]);
            var subRef = ref + "(" + i + ")";
            if (tp.propertyType !== PropertyType.PROPERTY) {
                collect(tp, bp, subPath, subRef, results);
                continue;
            }
            if (!tp.canSetExpression || tp.numKeys > 0 || bp.propertyValueType !== tp.propertyValueType) continue;
            var typeOk = false;
            for (var t = 0; t < syncTypes.length; t++) if (tp.propertyValueType === syncTypes[t]) typeOk = true;
            if (!typeOk) continue;

            var tv = tp.valueAtTime(comp.time, true);
            var signs = compareSigns(tv, bp.valueAtTime(comp.time, true));
            if (!signs) continue;

            var allPositive = true;
            for (var s = 0; s < signs.length; s++) if (signs[s] < 0) allPositive = false;
            var expr;
            if (allPositive) {
                expr = subRef;
            } else if (!(tv instanceof Array)) {
                expr = "-" + subRef;
            } else {
                var parts = [];
                for (var s = 0; s < signs.length; s++) parts.push((signs[s] < 0 ? "-" : "") + "v[" + s + "]");
                expr = "v = " + subRef + ";\n[" + parts.join(", ") + "]";
            }
            results.push({ path: subPath, expr: expr });
        }
    }

    function isNameTaken(name) {
        for (var i = 1; i <= comp.numLayers; i++) {
            if (i !== baseLayer.index && comp.layer(i).name === name) return true;
        }
        return false;
    }

    if (isNameTaken(baseLayer.name)) {
        var newName = baseLayer.name + " 同期元";
        for (var n = 2; isNameTaken(newName); n++) newName = baseLayer.name + " 同期元" + n;
        baseLayer.name = newName;
    }
    var layerRef = "thisComp.layer(\"" + baseLayer.name.replace(/"/g, "\\\"") + "\")";

    for (var i = 0; i < selectedLayers.length; i++) {
        var layer = selectedLayers[i];
        if (layer.index === baseLayer.index) continue;
        var effects = layer.property("ADBE Effect Parade");
        for (var e = 1; e <= effects.numProperties; e++) {
            var baseIdx = findBaseEffect(effects, e);
            if (!baseIdx) continue;

            var ref = layerRef + ".effect(" + baseIdx + ")";
            var results = [];
            collect(effects.property(e), baseEffects.property(baseIdx), [], ref, results);

            for (var r = 0; r < results.length; r++) {
                var prop = layer.property("ADBE Effect Parade").property(e);
                for (var p = 0; p < results[r].path.length; p++) prop = prop.property(results[r].path[p]);
                prop.expression = results[r].expr;
            }
        }
    }

    app.endUndoGroup();
})();
