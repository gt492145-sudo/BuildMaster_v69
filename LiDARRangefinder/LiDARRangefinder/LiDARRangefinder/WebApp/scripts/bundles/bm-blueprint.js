/* Compatibility loader for the blueprint upload/measurement bundle.
 * Keep this file small: index.html expects this path, while the maintained
 * implementation lives in scripts/features/blueprint-measurement.js.
 */
(function loadBuildMasterBlueprintBundle() {
    document.write('<script src="scripts/features/blueprint-measurement.js?v=v960-touch-pan"><\/script>');
}());
