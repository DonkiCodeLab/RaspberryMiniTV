Pod::Spec.new do |s|
  s.name = 'MiniTVTransfer'
  s.version = '1.0.0'
  s.summary = 'Durable MiniTV photo transfers for Expo'
  s.description = 'PhotoKit, background URLSession and a durable import journal.'
  s.license = { :type => 'Private' }
  s.author = 'MiniTV'
  s.homepage = 'https://expo.dev'
  s.platforms = { :ios => '17.0' }
  s.source = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Photos', 'BackgroundTasks', 'Security', 'CryptoKit', 'SwiftUI'
  s.source_files = '**/*.swift'
  s.swift_version = '5.9'
end
