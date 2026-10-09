Pod::Spec.new do |s|
  s.name           = 'app-discovery'
  s.version        = '0.1.0'
  s.summary        = 'FocusLock installed-app discovery (Android PackageManager + iOS LaunchServices).'
  s.description    = 'Exposes the device\'s installed applications to FocusLock through the Expo Modules API.'
  s.author         = 'FocusLock'
  s.homepage       = 'https://github.com/Waiyat/focuslock'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { :git => 'https://github.com/Waiyat/focuslock.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = 'ios/**/*.{h,m,mm,swift}'
  s.preserve_paths = 'ios/**/*.h'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
