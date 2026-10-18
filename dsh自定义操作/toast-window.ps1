param(
  [ValidateSet('done', 'question')]
  [string]$Kind = 'done',
  [int]$TimeoutMs = 6000
)

# Bottom-right reminder card.
#
# A WPF window rather than a Windows toast: toasts need a registered AppUserModelID
# and follow the system theme, while this card is ours — blue-on-white, no taskbar
# entry, never activated (the user may be typing elsewhere), and it closes itself
# or on click.
#
# Exit codes: 0 shown and closed, 1 failure.

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase

function Brush([string]$hex) {
  return [System.Windows.Media.BrushConverter]::new().ConvertFromString($hex)
}

try {
  $title = if ($Kind -eq 'question') { '需要你' } else { 'ok了' }
  $body = if ($Kind -eq 'question') { 'agent 在等你回答' } else { '全部任务已完成' }
  $glyph = if ($Kind -eq 'question') { '?' } else { [string][char]0x2713 }
  $accent = if ($Kind -eq 'question') { '#2B6CF6' } else { '#2B6CF6' }

  $window = New-Object System.Windows.Window
  $window.WindowStyle = [System.Windows.WindowStyle]::None
  $window.AllowsTransparency = $true
  $window.Background = [System.Windows.Media.Brushes]::Transparent
  $window.ShowInTaskbar = $false
  $window.Topmost = $true
  $window.ShowActivated = $false
  $window.ResizeMode = [System.Windows.ResizeMode]::NoResize
  $window.SizeToContent = [System.Windows.SizeToContent]::WidthAndHeight
  $window.MaxWidth = 460

  $card = New-Object System.Windows.Controls.Border
  $card.CornerRadius = [System.Windows.CornerRadius]::new(12)
  $card.Background = Brush '#FFFFFF'
  $card.BorderBrush = Brush '#D3E1FF'
  $card.BorderThickness = [System.Windows.Thickness]::new(1)
  $card.Padding = [System.Windows.Thickness]::new(16, 13, 20, 13)
  $card.Margin = [System.Windows.Thickness]::new(12, 12, 12, 12)
  $card.Cursor = [System.Windows.Input.Cursors]::Hand

  $shadow = New-Object System.Windows.Media.Effects.DropShadowEffect
  $shadow.BlurRadius = 20
  $shadow.ShadowDepth = 5
  $shadow.Direction = 270
  $shadow.Opacity = 0.16
  $shadow.Color = [System.Windows.Media.Colors]::Black
  $card.Effect = $shadow

  $row = New-Object System.Windows.Controls.StackPanel
  $row.Orientation = [System.Windows.Controls.Orientation]::Horizontal

  $iconHost = New-Object System.Windows.Controls.Grid
  $iconHost.Width = 40
  $iconHost.Height = 40
  $iconHost.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
  $iconHost.Margin = [System.Windows.Thickness]::new(0, 0, 14, 0)

  $dot = New-Object System.Windows.Shapes.Ellipse
  $dot.Width = 40
  $dot.Height = 40
  $dot.Fill = Brush $accent
  [void]$iconHost.Children.Add($dot)

  $mark = New-Object System.Windows.Controls.TextBlock
  $mark.Text = $glyph
  $mark.Foreground = [System.Windows.Media.Brushes]::White
  $mark.FontFamily = New-Object System.Windows.Media.FontFamily('Segoe UI Symbol, Microsoft YaHei UI')
  $mark.FontSize = 20
  $mark.FontWeight = [System.Windows.FontWeights]::Bold
  $mark.HorizontalAlignment = [System.Windows.HorizontalAlignment]::Center
  $mark.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
  $mark.TextAlignment = [System.Windows.TextAlignment]::Center
  [void]$iconHost.Children.Add($mark)

  $text = New-Object System.Windows.Controls.StackPanel
  $text.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
  $text.MaxWidth = 330

  $heading = New-Object System.Windows.Controls.TextBlock
  $heading.Text = $title
  $heading.FontFamily = New-Object System.Windows.Media.FontFamily('Microsoft YaHei UI, Segoe UI')
  $heading.FontSize = 16
  $heading.FontWeight = [System.Windows.FontWeights]::SemiBold
  $heading.Foreground = Brush '#16233D'
  $heading.TextWrapping = [System.Windows.TextWrapping]::NoWrap
  [void]$text.Children.Add($heading)

  $detail = New-Object System.Windows.Controls.TextBlock
  $detail.Text = $body
  $detail.FontFamily = New-Object System.Windows.Media.FontFamily('Microsoft YaHei UI, Segoe UI')
  $detail.FontSize = 13
  $detail.Margin = [System.Windows.Thickness]::new(0, 3, 0, 0)
  $detail.Foreground = Brush '#5D6B85'
  $detail.TextWrapping = [System.Windows.TextWrapping]::Wrap
  [void]$text.Children.Add($detail)

  [void]$row.Children.Add($iconHost)
  [void]$row.Children.Add($text)
  $card.Child = $row
  $window.Content = $card

  $window.Add_MouseLeftButtonDown({ $window.Close() })
  $window.Add_KeyDown({ $window.Close() })

  $timer = New-Object System.Windows.Threading.DispatcherTimer
  $timer.Interval = [TimeSpan]::FromMilliseconds($TimeoutMs)
  $timer.Add_Tick({
    $timer.Stop()
    $window.Close()
  })
  $timer.Start()

  $window.Add_Loaded({
    $area = [System.Windows.SystemParameters]::WorkArea
    $window.Left = $area.Right - $window.ActualWidth - 8
    $window.Top = $area.Bottom - $window.ActualHeight - 8
  })

  [void]$window.ShowDialog()
  exit 0
}
catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
