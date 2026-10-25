Pod::Spec.new do |s|
  s.name           = 'KHCarPlay'
  s.version        = '1.0.0'
  s.summary        = 'The KH Royals car line on CarPlay'
  s.description    = 'CarPlay scene and list screens for car line check-in (a CarPlay driving task app).'
  s.license        = { type: 'UNLICENSED' }
  s.author         = 'KH Royals'
  s.homepage       = 'https://github.com/RoyalRockinApps/khroyals'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'CarPlay'

  s.source_files = '**/*.swift'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
