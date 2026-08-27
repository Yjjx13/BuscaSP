$ErrorActionPreference = 'Stop'

$apiBase = 'http://127.0.0.1:3000'
$uploadDirectory = 'D:\BuscaSP\apps\api\uploads'
$screenshotDirectory = 'C:\Users\Dekaranger\Pictures\Screenshots'

$items = @(
  @{ OpenId='wanted_demo_01'; Nickname='Brás办公采购'; Image='屏幕截图 2026-08-13 235407.png'; File='wanted-demo-01.png'; Description='寻找惠普彩色连供喷墨打印机，要求支持A4打印并配备原装墨水。'; Quantity='10 台'; Spec='A4彩色连供，220V'; Price=750.00 },
  @{ OpenId='wanted_demo_02'; Nickname='Centro标签用品'; Image='屏幕截图 2026-08-13 235409.png'; File='wanted-demo-02.png'; Description='寻找便携式热敏小票打印机套装，需要兼容常用收银系统。'; Quantity='20 台'; Spec='USB或蓝牙连接，含热敏纸'; Price=160.00 },
  @{ OpenId='wanted_demo_03'; Nickname='Paulista包装商行'; Image='屏幕截图 2026-08-13 235411.png'; File='wanted-demo-03.png'; Description='寻找便携式标签打印机，配套15×30毫米不干胶标签纸。'; Quantity='30 台'; Spec='15×30毫米标签，支持手机连接'; Price=120.00 },
  @{ OpenId='wanted_demo_04'; Nickname='Bela Vista餐具'; Image='屏幕截图 2026-08-13 235414.png'; File='wanted-demo-04.png'; Description='寻找透明浮雕玻璃杯六件套，杯身需要厚实耐用。'; Quantity='50 套'; Spec='约300毫升，6只/套'; Price=28.00 },
  @{ OpenId='wanted_demo_05'; Nickname='Mooca玻璃批发'; Image='屏幕截图 2026-08-13 235416.png'; File='wanted-demo-05.png'; Description='寻找透明直身玻璃水杯套装，适合餐饮渠道批发。'; Quantity='80 套'; Spec='高杯，6只/套'; Price=30.00 },
  @{ OpenId='wanted_demo_06'; Nickname='Liberdade家居'; Image='屏幕截图 2026-08-13 235419.png'; File='wanted-demo-06.png'; Description='寻找透明水晶纹玻璃碗套装，用于水果和甜品盛装。'; Quantity='40 套'; Spec='多尺寸组合装'; Price=35.00 },
  @{ OpenId='wanted_demo_07'; Nickname='Cambuci小家电'; Image='屏幕截图 2026-08-13 235424.png'; File='wanted-demo-07.png'; Description='寻找多功能迷你电煮锅，要求带锅盖并且可以调节火力。'; Quantity='60 台'; Spec='约1.5升，巴西插头'; Price=75.00 },
  @{ OpenId='wanted_demo_08'; Nickname='Lapa三维耗材'; Image='屏幕截图 2026-08-13 235433.png'; File='wanted-demo-08.png'; Description='寻找白色3D打印耗材，要求线径稳定并适配常见打印机。'; Quantity='100 卷'; Spec='PLA，1.75毫米，1千克/卷'; Price=70.00 },
  @{ OpenId='wanted_demo_09'; Nickname='Santana创客用品'; Image='屏幕截图 2026-08-13 235436.png'; File='wanted-demo-09.png'; Description='寻找木色或棕色3D打印耗材，用于工艺品和装饰件打印。'; Quantity='80 卷'; Spec='PLA，1.75毫米，1千克/卷'; Price=75.00 },
  @{ OpenId='wanted_demo_10'; Nickname='Tatuapé灯具行'; Image='屏幕截图 2026-08-14 210550.png'; File='wanted-demo-10.png'; Description='寻找简约圆形LED吸顶灯，要求具备防尘和防潮性能。'; Quantity='100 个'; Spec='白光，适用于走廊和卧室'; Price=42.00 },
  @{ OpenId='wanted_demo_11'; Nickname='Ipiranga装饰材料'; Image='屏幕截图 2026-08-14 210610.png'; File='wanted-demo-11.png'; Description='寻找加厚木纹自粘墙纸，需要提供多种自然木色。'; Quantity='200 卷'; Spec='防水自粘，木纹款'; Price=18.00 },
  @{ OpenId='wanted_demo_12'; Nickname='Aclimação建材'; Image='屏幕截图 2026-08-14 210613.png'; File='wanted-demo-12.png'; Description='寻找大理石纹自粘墙纸，用于厨房和家具表面翻新。'; Quantity='150 卷'; Spec='防水防油，可裁剪'; Price=20.00 },
  @{ OpenId='wanted_demo_13'; Nickname='Pinheiros家饰'; Image='屏幕截图 2026-08-14 210618.png'; File='wanted-demo-13.png'; Description='寻找不规则造型壁挂镜，适用于卧室和服装店陈列。'; Quantity='40 面'; Spec='无框异形镜，含安装配件'; Price=55.00 },
  @{ OpenId='wanted_demo_14'; Nickname='Vila Mariana杯具'; Image='屏幕截图 2026-08-14 210632.png'; File='wanted-demo-14.png'; Description='寻找金色金属杯架，可整齐收纳多只玻璃杯或马克杯。'; Quantity='60 个'; Spec='金属材质，桌面式'; Price=38.00 },
  @{ OpenId='wanted_demo_15'; Nickname='Bom Retiro厨房用品'; Image='屏幕截图 2026-08-14 210640.png'; File='wanted-demo-15.png'; Description='寻找带按压出米功能的密封储米桶，适合家庭厨房使用。'; Quantity='50 个'; Spec='透明可视，带量杯'; Price=65.00 }
)

function Invoke-JsonPost {
  param([string]$Uri, [hashtable]$Body, [string]$Token = '')
  $headers = @{}
  if ($Token) { $headers.Authorization = "Bearer $Token" }
  $json = $Body | ConvertTo-Json -Depth 6 -Compress
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  Invoke-RestMethod -Method Post -Uri $Uri -Headers $headers -ContentType 'application/json; charset=utf-8' -Body $bytes
}

$health = Invoke-RestMethod -Uri "$apiBase/health"
if (-not $health.ok) { throw 'API 服务未就绪。' }

$created = 0
$skipped = 0
foreach ($item in $items) {
  $source = Join-Path $screenshotDirectory $item.Image
  $destination = Join-Path $uploadDirectory $item.File
  if (-not (Test-Path -LiteralPath $source)) { throw "找不到截图：$source" }
  Copy-Item -LiteralPath $source -Destination $destination -Force

  $login = Invoke-JsonPost -Uri "$apiBase/api/v1/auth/dev-login" -Body @{ openid=$item.OpenId; nickname=$item.Nickname }
  $token = $login.token
  $mine = Invoke-RestMethod -Uri "$apiBase/api/v1/me/wanted-posts" -Headers @{ Authorization="Bearer $token" }
  $existing = @($mine.items | Where-Object { $_.description -eq $item.Description })
  if ($existing.Count -gt 0) {
    $skipped++
    continue
  }

  $payload = @{
    description = $item.Description
    imageKeys = @("$apiBase/uploads/$($item.File)")
    targetPrice = [double]$item.Price
    quantity = $item.Quantity
    specText = $item.Spec
    validDays = 30
  }
  Invoke-JsonPost -Uri "$apiBase/api/v1/wanted-posts" -Body $payload -Token $token | Out-Null
  $created++
}

[pscustomobject]@{
  requested = $items.Count
  created = $created
  skipped = $skipped
  users = ($items.OpenId | Select-Object -Unique).Count
} | ConvertTo-Json -Compress
