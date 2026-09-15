/**
 * 中文（简体）词条字典
 * key 命名规范：模块.子项.动作/状态
 * 缺省时 fallback 到中文（当前默认）
 */
export default {
  // 通用
  common: {
    cancel: '取消',
    save: '保存',
    delete: '删除',
    add: '添加',
    close: '关闭',
    restore: '恢复',
    purge: '彻底删除',
    loading: '加载中...',
  },

  // 应用主体
  app: {
    searchPlaceholder: '搜索一下',
  },

  // 通用弹窗（全屏按钮多弹窗共用）
  dialog: {
    expand: '放大',
    collapse: '退出全屏',
    toggle: '切换全屏',
    minimize: '最小化到任务栏',
  },

  // 精简模式按钮
  minimalist: {
    enterTitle: '精简模式',
    exitTitle: '退出精简模式',
    snowTitle: '飘雪',
  },

  // 侧边栏
  sidebar: {
    home: '主页',
    removeTitle: '移除面板',
    removeMessage: '确定要移除「{title}」面板吗？\n该面板下的所有站点将一并删除。',
    removeOk: '移除',
    settings: '设置',
    addPanelTitle: '添加面板',
    addPanelHint: '新增的面板与主页功能一致',
    editPanelTitle: '编辑面板',
    editPanelHint: '修改面板的图标和名称',
    fieldIcon: '图标',
    fieldName: '名称',
    namePlaceholderAdd: '如：工作 / 学习 / 设计',
    namePlaceholderEdit: '面板名称',
    collapse: '收起侧边栏',
    expand: '展开侧边栏',
  },

  // 上下文菜单
  contextMenu: {
    edit: '编辑',
    remove: '移除',
  },

  // 设置面板
  settings: {
    title: '设置',
    tabs: {
      general: '外观',
      data: '数据管理',
      about: '关于',
    },
    wallpaper: {
      title: '壁纸模式',
      gradient: '渐变',
      image: '自定义',
      random: '随机',
      urlPlaceholder: '壁纸图片 URL（例如：https://xxx.jpg）',
      refresh: '刷新间隔',
      hours: '{n} 小时',
      refreshNow: '换一张壁纸',
    },
    grid: {
      title: '每行格子',
      auto: '自适应',
    },
    themeColor: {
      title: '主题色',
      hint: '用于侧边栏、按钮、强调色（不影响警示/错误色）',
      custom: '自定义',
    },
    themeMode: {
      toDark: '切换到深色模式',
      toLight: '切换到浅色模式',
    },
    language: {
      title: '语言',
      hint: '切换界面语言，立即生效',
      zhCN: '中文（简体）',
      en: 'English',
    },
    data: {
      backupTitle: '备份恢复',
      backupHint: '备份包含导航、设置、待办、日程全部数据，可跨浏览器迁移',
      backup: '备份数据',
      restore: '恢复数据',
      resetTitle: '重置',
      resetSettings: '重置设置（仅外观设置）',
      resetAll: '清空全部数据',
      backupDone: '备份文件已开始下载',
      backupFail: '备份失败：{msg}',
      restoreConfirmTitle: '恢复数据',
      restoreConfirmMsg: '确定要用「{name}」恢复数据吗？\n当前全部数据将被覆盖，且不可撤销。',
      restoreOk: '恢复',
      restoreDone: '数据恢复成功',
      restoreFail: '恢复失败：{msg}',
      invalidFile: '备份文件格式不正确',
    },
    reset: {
      title: '重置设置',
      message: '确定要把设置恢复为默认值吗？\n导航数据不受影响。',
      okText: '重置',
      done: '设置已恢复默认值',
    },
    resetAll: {
      title: '清空全部数据',
      message: '确定要清空全部导航和设置吗？\n此操作不可恢复。',
      okText: '清空',
    },
    about: {
      name: 'itabs-nav',
      version: 'v0.1.0 · 纯前端导航页',
      buildDate: '构建日期',
      desc: 'iTab 风格的浏览器导航页：玻璃拟态、搜索引擎栏、拖拽排序、小组件（时钟/ 天气 / 待办 / 日历）、无后端，数据存储在浏览器 IndexedDB 中',
    },
    presetNames: {
      indigo: '靛蓝',
      violet: '紫罗兰',
      rose: '玫瑰',
      emerald: '翡翠',
      amber: '琥珀',
      sky: '天蓝',
    },
  },

  // 确认弹窗
  confirm: {
    title: '确认',
    ok: '确定',
    cancel: '取消',
  },

  // 搜索引擎栏
  searchBar: {
    triggerPlaceholder: '搜索',
    search: '搜索',
    addEngine: '添加',
    removeTitle: '删除搜索引擎',
    removeMessage: '确定要删除「{name}」吗？',
    removeIconTitle: '移除该搜索引擎',
  },

  // 引擎编辑器
  engineEditor: {
    title: '搜索引擎',
    installed: '已添加',
    customName: '名称',
    customUrl: 'URL（含 ?q=）',
    customUrlPlaceholder: 'https://example.com/search?q=',
    cancel: '取消',
    invalidUrl: 'URL 格式不正确',
    hint: '已勾选= 保留 / 新增。取消勾选= 从导航页移除',
    keepHint: '勾选要保留或新增的',
    addCustom: '添加自定义引擎',
    iconUrl: '图标 URL（留空自动抓取）',
    iconAutoPlaceholder: '自动生成 favicon',
    auto: '自动',
    noChange: '无变化',
    saveChanges: '保存更改',
  },

  // 站点编辑
  siteEditor: {
    addTitle: '添加站点',
    editTitle: '编辑站点',
    name: '名称',
    url: 'URL',
    namePlaceholder: '如：百度',
    urlPlaceholder: 'https://example.com',
    cancel: '取消',
    save: '保存',
    tabs: {
      site: '自定义站点',
      widgets: '小组件',
    },
    widgetAdded: '已添加「{name}」到主页',
    invalidUrl: 'URL 格式不正确',
    invalidUrlExample: '请输入正确的 URL（例如：example.com）',
    iconUrl: '图标 URL（留空自动生成）',
    iconAutoPlaceholder: '自动生成 favicon',
    auto: '自动',
    iconPreset: '图标库',
    iconSearch: '搜索图标名称…',
    iconEmpty: '无匹配图标',
    widgetCats: {
      tool: '工具',
    },
  },

  // 站点卡片
  siteCard: {
    removeTitle: '删除该卡片',
  },

  // 站点网格空态
  siteGrid: {
    exitEdit: '点击退出编辑模式',
    empty: '这个面板还是空的',
    emptyDesc: '添加第一个导航，打造你的专属起始页',
    emptyHint: '添加第一个导航',
  },

  // 站点右键菜单
  siteContextMenu: {
    edit: '编辑',
    delete: '删除',
    resize: '调整大小',
    confirmDeleteTitle: '删除站点',
    confirmDeleteMessage: '确定要删除「{name}」吗？',
  },

  // 待办弹窗
  todo: {
    title: '待办',
    empty: '暂无待办',
    emptyDone: '还没有已完成的事情',
    emptyUndone: '没有未完成项',
    placeholder: '回车添加待办…',
    tabs: {
      undone: '未完成',
      done: '已完成',
      trash: '回收站',
    },
    emptyTrash: '回收站是空的',
    batchSelectAll: '全选',
    batchInvert: '反选',
    batchComplete: '标记完成',
    batchUncomplete: '标记未完成',
    batchRestore: '恢复',
    batchPurge: '彻底删除',
    purgeMessage: '确定要彻底删除选中{n} 项吗？此操作不可恢复。',
    allSelected: '已选全部',
    selectedCount: '已选{n} 项',
    noneSelected: '未选择',
    pendingCount: '{n} 项未完成',
    doneCount: '{n} 项已完成',
    trashCount: '{n} 项已删除 · 可恢复',
    time: {
      justNow: '刚刚',
      minutesAgo: '{n} 分钟前',
      hoursAgo: '{n} 小时前',
      daysAgo: '{n} 天前',
    },
    dblClickEdit: '双击编辑',
    dragToReorder: '拖动排序',
    moveToTrash: '移到回收站',
  },

  // 日历弹窗
  calendar: {
    title: '日历',
    today: '今天',
    prevMonth: '上一月',
    nextMonth: '下一月',
    selectYear: '选择年份',
    prevDecade: '往前十年',
    nextDecade: '往后十年',
    yearFormat: '{y}年',
    detailDate: '{m}月 · 周{w}',
    zodiacAnimal: '属{x}',
    fetalGod: '胎神',
    taiSui: '太岁',
    sign: '星座',
    auspicious: '宜',
    inauspicious: '忌',
    pengZuGan: '彭祖百忌·天干：{v}',
    pengZuZhi: '彭祖百忌·地支：{v}',
    zodiac: {
      capricorn: '摩羯座', aquarius: '水瓶座', pisces: '双鱼座',
      aries: '白羊座', taurus: '金牛座', gemini: '双子座',
      cancer: '巨蟹座', leo: '狮子座', virgo: '处女座',
      libra: '天秤座', scorpio: '天蝎座', sagittarius: '射手座',
    },
    animals: {
      鼠: '鼠', 牛: '牛', 虎: '虎', 兔: '兔', 龙: '龙', 蛇: '蛇',
      马: '马', 羊: '羊', 猴: '猴', 鸡: '鸡', 狗: '狗', 猪: '猪',
    },
    weekdays: ['一', '二', '三', '四', '五', '六', '日'],
    months: [
      '一月', '二月', '三月', '四月', '五月', '六月',
      '七月', '八月', '九月', '十月', '十一月', '十二月',
    ],
  },

  // 天气弹窗
  weather: {
    title: '天气',
    refresh: '刷新',
    refreshTitle: '强制刷新到最新数据',
    cachedHint: '今日缓存 {t} · 点击查询更新',
    loading: '加载中…',
    error: '获取天气失败',
    today: '今天',
    tomorrow: '明天',
    weekdays: ['日', '一', '二', '三', '四', '五', '六'],
    province: '省份',
    cityLabel: '城市',
    hotCities: '热门城市',
    searchRegion: '搜索省市…',
    noResult: '无匹配地区',
    locateTitle: '自动定位',
    resetTitle: '重置为深圳',
    searchBtn: '查询',
    feelsLike: '体感 {v}°',
    observed: '观测 {t}',
    trend24: '24 小时趋势',
    empty: '输入城市后点点击查询',
    humidity: '湿度',
    wind: '风速',
    direction: '风向',
    pressure: '气压',
    visibility: '能见度',
    uvIndex: '紫外线',
    dewPoint: '露点',
    cloudCover: '云量',
    sunrise: '日出',
    sunset: '日落',
    moonrise: '月升 / 月落',
    phase: '月相',
    forecast: '未来预报',
    lifeIndices: '生活指数',
    aqi: '空气质量',
    alerts: '气象预警',
    life: {
      dressing: '穿衣',
      uv: '紫外线',
      carWash: '洗车',
      drying: '晾晒',
      ac: '空调',
      coldRisk: '感冒',
      exercise: '运动',
      comfort: '舒适度',
      travel: '出行',
      fish: '钓鱼',
      allergy: '过敏',
      sunscreen: '防晒',
      mood: '心情',
      beer: '啤酒',
      umbrella: '雨伞',
      traffic: '交通',
      airPurifier: '空气净化器',
      pollen: '花粉',
    },
  },

  // 热门弹窗
  hot: {
    title: '热门榜单',
    refresh: '刷新',
    refreshTitle: '强制刷新到最新数据',
    cachedHint: '今日缓存',
    loading: '加载中…',
    updatedAt: '更新时间：{t}',
    offline: '离线',
    apiDown: 'API 不可访问',
    noData: '暂无数据',
    retry: '重试',
  },

  // 壁纸库弹窗（Wallhaven）
  wallpaper: {
    title: '壁纸库',
    searchPlaceholder: '搜索壁纸…（如：nature、anime，留空看精选）',
    search: '搜索',
    refresh: '刷新',
    shuffle: '换一批',
    categories: {
      all: '全部',
      general: '通用',
      anime: '动漫',
      people: '人物',
    },
    sorting: {
      toplist: '精选',
      date_added: '最新',
      views: '最热',
      favorites: '最爱',
      random: '随机',
    },
    prevPage: '上一页',
    nextPage: '下一页',
    pageOf: '第{n}/{m}页',
    setAsWallpaper: '设为桌面壁纸',
    setDone: '已设为桌面壁纸',
    download: '下载原图',
    downloading: '下载中…',
    downloadDone: '壁纸已开始下载',
    downloadFail: '直接下载失败，已在新标签页打开原图',
    zoomIn: '放大',
    zoomOut: '缩小',
    resetZoom: '适应窗口（重置缩放）',
    openSource: '详情页',
    error: '壁纸加载失败，请检查网络后重试',
    retry: '重试',
    empty: '没有找到相关壁纸，换个关键词试试',
  },

  // 小组件任务栏
  taskbar: {
    restoreTitle: '点击还原窗口',
  },

  // 每日一言
  saying: {
    format: '「{s}」',
    copied: '已成功复制到剪贴板',
    copyFail: '复制失败，请检查浏览器权限',
    refreshing: '刷新中…',
    tapHint: '点击换一条',
    copy: '复制',
    copiedTitle: '已复制',
    another: '换一条',
  },

  // 网络错误（热榜/天气兜底提示）
  http: {
    timeout: '请求超时',
    networkError: '网络错误',
    unknownError: '未知错误',
  },

  // 小组件
  widgets: {
    weather: '天气',
    todo: '待办',
    calendar: '日历',
    hot: '热门',
  },

  // 编辑模式
  editMode: {
    enter: '编辑主页',
    done: '完成',
  },

  // 时钟/问候
  clock: {
    greeting: {
      night: '夜深好',
      morning: '早上好',
      noon: '中午好',
      afternoon: '下午好',
      evening: '晚上好',
    },
    weekDays: ['日', '一', '二', '三', '四', '五', '六'],
    weatherToday: '今天',
    weatherClickHint: '点击查看',
    todoUnit: '项任务',
    lunarFormat: '农历{month}{day} · 周{week}',
  },
}