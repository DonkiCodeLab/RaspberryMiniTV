"""Regenerate the dependency-free Xcode project with stable object identifiers."""
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT / 'MiniTV.xcodeproj'
objects = {}


def ident(name):
    return hashlib.sha256(('minitv-tvos:' + name).encode()).hexdigest()[:24].upper()


def obj(name, body):
    key = ident(name)
    objects[key] = '{ ' + body + ' };'
    return key


def array(values):
    return '(' + ', '.join(values) + (',' if values else '') + ')'


sources = []
files = []
for source in sorted((ROOT / 'MiniTV').glob('*.swift')):
    ref = obj(source.name, f'isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = {source.name}; sourceTree = "<group>";')
    files.append(ref)
    sources.append(obj(source.name + ':build', f'isa = PBXBuildFile; fileRef = {ref};'))
files.append(obj('Info.plist', 'isa = PBXFileReference; lastKnownFileType = text.plist.xml; path = Info.plist; sourceTree = "<group>";'))
resources = []
if (ROOT / 'MiniTV/Assets.xcassets').exists():
    ref = obj('assets', 'isa = PBXFileReference; lastKnownFileType = folder.assetcatalog; path = Assets.xcassets; sourceTree = "<group>";')
    files.append(ref)
    resources.append(obj('assets:build', f'isa = PBXBuildFile; fileRef = {ref};'))
product = obj('product', 'isa = PBXFileReference; explicitFileType = wrapper.application; path = MiniTV.app; sourceTree = BUILT_PRODUCTS_DIR;')
products = obj('products', f'isa = PBXGroup; children = {array([product])}; name = Products; sourceTree = "<group>";')
group = obj('source-group', f'isa = PBXGroup; children = {array(files)}; path = MiniTV; sourceTree = "<group>";')
main = obj('main-group', f'isa = PBXGroup; children = {array([group, products])}; sourceTree = "<group>";')
phases = [obj('sources', f'isa = PBXSourcesBuildPhase; buildActionMask = 2147483647; files = {array(sources)}; runOnlyForDeploymentPostprocessing = 0;'),
          obj('frameworks', 'isa = PBXFrameworksBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0;'),
          obj('resources', f'isa = PBXResourcesBuildPhase; buildActionMask = 2147483647; files = {array(resources)}; runOnlyForDeploymentPostprocessing = 0;')]
config_lists = {}
for level in ('project', 'target'):
    configs = []
    for mode in ('Debug', 'Release'):
        if level == 'project':
            settings = {'SDKROOT': 'appletvos', 'TVOS_DEPLOYMENT_TARGET': '17.0', 'SWIFT_VERSION': '5.0',
                        'SWIFT_STRICT_CONCURRENCY': 'targeted', 'CLANG_ENABLE_MODULES': 'YES',
                        'SWIFT_OPTIMIZATION_LEVEL': '-Onone' if mode == 'Debug' else '-O',
                        'DEBUG_INFORMATION_FORMAT': 'dwarf' if mode == 'Debug' else 'dwarf-with-dsym'}
            if mode == 'Debug':
                settings['SWIFT_ACTIVE_COMPILATION_CONDITIONS'] = 'DEBUG'
        else:
            settings = {'PRODUCT_BUNDLE_IDENTIFIER': 'com.donkicodelab.minitv.tv', 'PRODUCT_NAME': '$(TARGET_NAME)',
                        'INFOPLIST_FILE': 'MiniTV/Info.plist', 'GENERATE_INFOPLIST_FILE': 'NO',
                        'TARGETED_DEVICE_FAMILY': '3', 'SUPPORTED_PLATFORMS': 'appletvos appletvsimulator',
                        'CODE_SIGN_STYLE': 'Automatic', 'ENABLE_PREVIEWS': 'YES',
                        'LD_RUNPATH_SEARCH_PATHS': '$(inherited) @executable_path/Frameworks'}
            if resources:
                settings['ASSETCATALOG_COMPILER_APPICON_NAME'] = 'App Icon & Top Shelf Image'
        config = obj(level + mode, 'isa = XCBuildConfiguration; name = ' + mode + '; buildSettings = {' +
                     ' '.join(key + ' = ' + json.dumps(value) + ';' for key, value in settings.items()) + '};')
        configs.append(config)
    config_lists[level] = obj(level + ':configs', f'isa = XCConfigurationList; buildConfigurations = {array(configs)}; defaultConfigurationIsVisible = 0; defaultConfigurationName = Release;')
target = obj('target', f'isa = PBXNativeTarget; buildConfigurationList = {config_lists["target"]}; buildPhases = {array(phases)}; buildRules = (); dependencies = (); name = MiniTV; productName = MiniTV; productReference = {product}; productType = "com.apple.product-type.application";')
project = obj('project', f'isa = PBXProject; attributes = {{LastUpgradeCheck = 2600;}}; buildConfigurationList = {config_lists["project"]}; compatibilityVersion = "Xcode 14.0"; developmentRegion = es; knownRegions = (es, en, Base); mainGroup = {main}; productRefGroup = {products}; projectDirPath = ""; projectRoot = ""; targets = {array([target])};')
PROJECT.mkdir(exist_ok=True)
(PROJECT / 'project.pbxproj').write_text('// !$*UTF8*$!\n{ archiveVersion = 1; classes = {}; objectVersion = 56; objects = {\n' +
    '\n'.join(key + ' = ' + value for key, value in objects.items()) + '\n}; rootObject = ' + project + '; }\n')
scheme = PROJECT / 'xcshareddata/xcschemes/MiniTV.xcscheme'
scheme.parent.mkdir(parents=True, exist_ok=True)
ref = f'<BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{target}" BuildableName="MiniTV.app" BlueprintName="MiniTV" ReferencedContainer="container:MiniTV.xcodeproj"/>'
scheme.write_text(f'''<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="2600" version="1.3">
 <BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES"><BuildActionEntries><BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES">{ref}</BuildActionEntry></BuildActionEntries></BuildAction>
 <TestAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" shouldUseLaunchSchemeArgsEnv="YES"><Testables/></TestAction>
 <LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugDocumentVersioning="YES" allowLocationSimulation="YES"><BuildableProductRunnable runnableDebuggingMode="0">{ref}</BuildableProductRunnable></LaunchAction>
 <ProfileAction buildConfiguration="Release" shouldUseLaunchSchemeArgsEnv="YES" savedToolIdentifier="" useCustomWorkingDirectory="NO" debugDocumentVersioning="YES"><BuildableProductRunnable runnableDebuggingMode="0">{ref}</BuildableProductRunnable></ProfileAction>
 <AnalyzeAction buildConfiguration="Debug"/><ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/>
</Scheme>''')
print(PROJECT)
