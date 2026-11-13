(function () {
    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem) || comp.selectedLayers.length === 0) return;

    var props = comp.selectedLayers[0].selectedProperties;
    var prop = null;
    for (var i = props.length - 1; i >= 0 && !prop; i--) {
        if (props[i] instanceof Property && props[i].canVaryOverTime) prop = props[i];
    }
    if (!prop) return;

    var t = comp.time;
    var prevIndex = 0;
    for (var k = 1; k <= prop.numKeys; k++) {
        if (prop.keyTime(k) <= t + comp.frameDuration / 2) prevIndex = k;
    }
    if (prevIndex === 0) return;
    var prevValue = prop.keyValue(prevIndex);

    app.beginUndoGroup("Paste Offset Keys");

    app.executeCommand(20);

    var pasted = prop.selectedKeys;
    if (pasted.length > 0) {
        var firstValue = prop.keyValue(pasted[0]);
        for (var p = 0; p < pasted.length; p++) {
            var val = prop.keyValue(pasted[p]);
            if (typeof val === "number") {
                prop.setValueAtKey(pasted[p], val + prevValue - firstValue);
            } else {
                var newVal = [];
                for (var d = 0; d < val.length; d++) newVal[d] = val[d] + prevValue[d] - firstValue[d];
                prop.setValueAtKey(pasted[p], newVal);
            }
        }
    }

    app.endUndoGroup();
})();
