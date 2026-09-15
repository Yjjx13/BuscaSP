$ErrorActionPreference = 'Stop'

$apiBase = 'http://127.0.0.1:3000'

function Invoke-JsonRequest {
  param(
    [ValidateSet('POST', 'PUT', 'PATCH')][string]$Method,
    [string]$Uri,
    [hashtable]$Body,
    [string]$Token = ''
  )
  $headers = @{}
  if ($Token) { $headers.Authorization = "Bearer $Token" }
  $json = $Body | ConvertTo-Json -Depth 8 -Compress
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  Invoke-RestMethod -Method $Method -Uri $Uri -Headers $headers -ContentType 'application/json; charset=utf-8' -Body $bytes
}

function Login-DevUser {
  param([string]$OpenId, [string]$Nickname)
  Invoke-JsonRequest -Method POST -Uri "$apiBase/api/v1/auth/dev-login" -Body @{ openid = $OpenId; nickname = $Nickname }
}

$health = Invoke-RestMethod -Uri "$apiBase/health"
if (-not $health.ok) { throw 'API 服务未就绪。' }

$owner = Login-DevUser -OpenId 'miniprogram_dev_user' -Nickname '小程序测试用户'
$ownerToken = $owner.token
$existing = Invoke-RestMethod -Uri "$apiBase/api/v1/me/wanted-posts" -Headers @{ Authorization = "Bearer $ownerToken" }

$groups = @(
  @{
    Key = 'ACTIVE'
    Description = '寻找304不锈钢保温杯，500ml容量，需支持整箱批发。'
    Quantity = '20 箱'
    Spec = '304不锈钢，500ml，单独彩盒包装'
    TargetPrice = 18.50
    Image = "$apiBase/uploads/testimp-butter-400g.jpg"
    ResponderOpenId = 'status_demo_supplier_active'
    ResponderName = 'Brás现货供应商'
    Contact = '+55 11 98888-3101'
    OfferPrice = 17.90
    AvailableQuantity = '30 箱'
    StockType = 'SPOT'
    Message = '现货可供，银色和黑色均有库存，每箱24个。'
    FinalResponseStatus = 'ACTIVE'
    FinalWantedStatus = 'ACTIVE'
  },
  @{
    Key = 'ACCEPTED'
    Description = '寻找白色PLA 3D打印耗材，线径1.75mm，每卷1kg，要求圣保罗本地当天自提。'
    Quantity = '50 卷'
    Spec = 'PLA白色，1.75mm，净重1kg/卷'
    TargetPrice = 72.00
    Image = "$apiBase/uploads/wanted-demo-08.png"
    ResponderOpenId = 'status_demo_supplier_accepted'
    ResponderName = 'Centro三维材料'
    Contact = '+55 11 97777-3202'
    OfferPrice = 69.80
    AvailableQuantity = '80 卷'
    StockType = 'SPOT'
    Message = '白色PLA现货充足，可当天自提，批量采购可维持该报价。'
    FinalResponseStatus = 'ACCEPTED'
    FinalWantedStatus = 'FOUND'
  },
  @{
    Key = 'REJECTED'
    Description = '寻找便携式热敏标签打印机，要求支持手机蓝牙连接。'
    Quantity = '15 台'
    Spec = '蓝牙连接，适配15×30mm标签纸'
    TargetPrice = 135.00
    Image = "$apiBase/uploads/wanted-demo-03.png"
    ResponderOpenId = 'status_demo_supplier_rejected'
    ResponderName = 'Mooca标签设备'
    Contact = '+55 11 96666-3303'
    OfferPrice = 149.00
    AvailableQuantity = '15 台'
    StockType = 'PRESALE'
    ExpectedAvailableAt = '2026-09-18'
    Message = '可按需求预订，黑白两色可选，预计到货后统一交付。'
    FinalResponseStatus = 'REJECTED'
    FinalWantedStatus = 'CLOSED'
  }
)

$results = @()
foreach ($group in $groups) {
  $found = @($existing.items | Where-Object { $_.description -eq $group.Description })
  if ($found.Count -gt 0) {
    $results += [pscustomobject]@{ state = $group.Key; wantedId = $found[0].id; result = 'already_exists' }
    continue
  }

  $wanted = Invoke-JsonRequest -Method POST -Uri "$apiBase/api/v1/wanted-posts" -Token $ownerToken -Body @{
    description = $group.Description
    imageKeys = @($group.Image)
    targetPrice = [double]$group.TargetPrice
    quantity = $group.Quantity
    specText = $group.Spec
    validDays = 30
  }

  $supplier = Login-DevUser -OpenId $group.ResponderOpenId -Nickname $group.ResponderName
  Invoke-JsonRequest -Method PUT -Uri "$apiBase/api/v1/me/contacts" -Token $supplier.token -Body @{
    contactType = 'PHONE'
    value = $group.Contact
    isPrimary = $true
  } | Out-Null

  $offerBody = @{
    offerPrice = [double]$group.OfferPrice
    availableQuantity = $group.AvailableQuantity
    stockType = $group.StockType
    message = $group.Message
  }
  if ($group.ExpectedAvailableAt) { $offerBody.expectedAvailableAt = $group.ExpectedAvailableAt }
  $response = Invoke-JsonRequest -Method POST -Uri "$apiBase/api/v1/wanted-posts/$($wanted.id)/responses" -Token $supplier.token -Body $offerBody

  if ($group.FinalResponseStatus -ne 'ACTIVE') {
    Invoke-JsonRequest -Method PATCH -Uri "$apiBase/api/v1/wanted-responses/$($response.id)" -Token $ownerToken -Body @{
      status = $group.FinalResponseStatus
    } | Out-Null
  }
  if ($group.FinalWantedStatus -eq 'CLOSED') {
    Invoke-JsonRequest -Method PATCH -Uri "$apiBase/api/v1/wanted-posts/$($wanted.id)/status" -Token $ownerToken -Body @{
      status = 'CLOSED'
    } | Out-Null
  }

  $results += [pscustomobject]@{
    state = $group.Key
    wantedId = $wanted.id
    responseId = $response.id
    supplier = $group.ResponderName
    result = 'created'
  }
}

$results | ConvertTo-Json -Compress
