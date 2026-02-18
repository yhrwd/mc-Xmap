import { ref, onMounted, onUnmounted, type Ref } from 'vue'
import { 
  camera, 
  mouseWorldCoord, 
  isDragging, 
  isMarkerPickMode,
  markers,
  hoveredMarkerId,
  setZoom, 
  screenToWorld,
  clampCameraPosition,
  setMarkerDraftFromWorld,
  worldToScreen,
} from '@/stores/mapStore'

interface TouchData {
  id: number
  x: number
  y: number
}

export function useMapInteraction(
  canvasRef: Ref<HTMLCanvasElement | null>,
  options: {
    onRender?: () => void
    onDragStart?: () => void
    onDragEnd?: () => void
  } = {}
) {
  // 拖拽状态
  const dragStart = ref<{ x: number; y: number } | null>(null)
  const cameraStart = ref<{ x: number; z: number } | null>(null)
  
  // 触摸状态
  const touches = ref<Map<number, TouchData>>(new Map())
  const lastTouchDistance = ref<number>(0)
  const lastTouchCenter = ref<{ x: number; y: number } | null>(null)
  
  // 更新鼠标世界坐标
  function updateMouseWorldCoord(clientX: number, clientY: number) {
    if (!canvasRef.value) return
    
    const rect = canvasRef.value.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    
    const worldCoord = screenToWorld(x, y)
    mouseWorldCoord.value = worldCoord
  }

  function updateHoveredMarker(clientX: number, clientY: number) {
    if (!canvasRef.value) return

    const rect = canvasRef.value.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top

    if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
      if (hoveredMarkerId.value !== null) {
        hoveredMarkerId.value = null
        options.onRender?.()
      }
      return
    }

    let nearestId: string | null = null
    let nearestDistance = Infinity
    const hitRadius = 14

    for (const marker of markers.value) {
      const pos = worldToScreen(marker.x, marker.z)
      const dx = pos.x - x
      const dy = pos.y - y
      const distance = Math.hypot(dx, dy)
      if (distance <= hitRadius && distance < nearestDistance) {
        nearestDistance = distance
        nearestId = marker.id
      }
    }

    if (hoveredMarkerId.value !== nearestId) {
      hoveredMarkerId.value = nearestId
      options.onRender?.()
    }
  }
  
  // 鼠标按下
  function onMouseDown(e: MouseEvent) {
    if (e.button !== 0) return // 只处理左键
    
    e.preventDefault()
    updateMouseWorldCoord(e.clientX, e.clientY)

    if (isMarkerPickMode.value) {
      setMarkerDraftFromWorld(mouseWorldCoord.value.x, mouseWorldCoord.value.z)
      isMarkerPickMode.value = false
      return
    }
    
    isDragging.value = true
    dragStart.value = { x: e.clientX, y: e.clientY }
    cameraStart.value = { x: camera.x, z: camera.z }
    
    options.onDragStart?.()
  }
  
  // 鼠标移动
  function onMouseMove(e: MouseEvent) {
    // 更新鼠标坐标
    updateMouseWorldCoord(e.clientX, e.clientY)
    updateHoveredMarker(e.clientX, e.clientY)
    
    if (!isDragging.value || !dragStart.value || !cameraStart.value) return
    
    const dx = (e.clientX - dragStart.value.x) / camera.zoom
    const dy = (e.clientY - dragStart.value.y) / camera.zoom
    
    camera.x = cameraStart.value.x - dx
    camera.z = cameraStart.value.z - dy
    clampCameraPosition()
    
    options.onRender?.()
  }
  
  // 鼠标释放
  function onMouseUp() {
    if (isDragging.value) {
      isDragging.value = false
      dragStart.value = null
      cameraStart.value = null
      options.onDragEnd?.()
    }
  }

  function onMouseLeave() {
    if (hoveredMarkerId.value !== null) {
      hoveredMarkerId.value = null
      options.onRender?.()
    }
  }
  
  // 鼠标滚轮缩放
  function onWheel(e: WheelEvent) {
    e.preventDefault()
    
    if (!canvasRef.value) return
    
    const rect = canvasRef.value.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    
    // 计算新的缩放级别
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    const newZoom = camera.zoom * delta
    
    setZoom(newZoom, mouseX, mouseY)
    
    // 更新鼠标坐标
    updateMouseWorldCoord(e.clientX, e.clientY)
    
    options.onRender?.()
  }
  
  // 获取触摸点列表
  function getTouchList(): TouchData[] {
    return Array.from(touches.value.values())
  }
  
  // 计算触摸点之间的距离
  function getTouchDistance(touch1: TouchData, touch2: TouchData): number {
    const dx = touch1.x - touch2.x
    const dy = touch1.y - touch2.y
    return Math.sqrt(dx * dx + dy * dy)
  }
  
  // 计算触摸中心点
  function getTouchCenter(touch1: TouchData, touch2: TouchData): { x: number; y: number } {
    return {
      x: (touch1.x + touch2.x) / 2,
      y: (touch1.y + touch2.y) / 2
    }
  }
  
  // 触摸开始
  function onTouchStart(e: TouchEvent) {
    e.preventDefault()
    
    if (!canvasRef.value) return
    
    const rect = canvasRef.value.getBoundingClientRect()
    
    // 更新触摸点
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i]!
      touches.value.set(touch.identifier, {
        id: touch.identifier,
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top
      })
    }
    
    const touchList = getTouchList()

    if (isMarkerPickMode.value && touchList.length > 0) {
      const picked = touchList[0]!
      const world = screenToWorld(picked.x, picked.y)
      setMarkerDraftFromWorld(world.x, world.z)
      isMarkerPickMode.value = false
      return
    }
    
    if (touchList.length === 1) {
      // 单指拖拽
      isDragging.value = true
      dragStart.value = { x: touchList[0]!.x, y: touchList[0]!.y }
      cameraStart.value = { x: camera.x, z: camera.z }
      options.onDragStart?.()
    } else if (touchList.length === 2) {
      // 双指缩放
      isDragging.value = false
      lastTouchDistance.value = getTouchDistance(touchList[0]!, touchList[1]!)
      lastTouchCenter.value = getTouchCenter(touchList[0]!, touchList[1]!)
    }
    
    // 更新坐标
    if (touchList.length > 0) {
      updateMouseWorldCoord(touchList[0]!.x + rect.left, touchList[0]!.y + rect.top)
    }
  }
  
  // 触摸移动
  function onTouchMove(e: TouchEvent) {
    e.preventDefault()
    
    if (!canvasRef.value) return
    
    const rect = canvasRef.value.getBoundingClientRect()
    
    // 更新触摸点
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i]!
      if (touches.value.has(touch.identifier)) {
        touches.value.set(touch.identifier, {
          id: touch.identifier,
          x: touch.clientX - rect.left,
          y: touch.clientY - rect.top
        })
      }
    }
    
    const touchList = getTouchList()
    
    if (touchList.length === 1 && isDragging.value && cameraStart.value && dragStart.value) {
      // 单指拖拽
      const dx = (touchList[0]!.x - dragStart.value.x) / camera.zoom
      const dy = (touchList[0]!.y - dragStart.value.y) / camera.zoom
      
      camera.x = cameraStart.value.x - dx
      camera.z = cameraStart.value.z - dy
      clampCameraPosition()
      
      options.onRender?.()
    } else if (touchList.length === 2) {
      // 双指缩放
      const currentDistance = getTouchDistance(touchList[0]!, touchList[1]!)
      const currentCenter = getTouchCenter(touchList[0]!, touchList[1]!)
      
      if (lastTouchDistance.value > 0) {
        const scale = currentDistance / lastTouchDistance.value
        const newZoom = camera.zoom * scale
        
        setZoom(newZoom, currentCenter.x, currentCenter.y)
        options.onRender?.()
      }
      
      lastTouchDistance.value = currentDistance
      lastTouchCenter.value = currentCenter
    }
    
    // 更新坐标
    if (touchList.length > 0) {
      updateMouseWorldCoord(touchList[0]!.x + rect.left, touchList[0]!.y + rect.top)
    }
  }
  
  // 触摸结束
  function onTouchEnd(e: TouchEvent) {
    e.preventDefault()
    
    // 移除触摸点
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i]!
      touches.value.delete(touch.identifier)
    }
    
    const touchList = getTouchList()
    
    if (touchList.length === 0) {
      // 所有触摸结束
      isDragging.value = false
      dragStart.value = null
      cameraStart.value = null
      lastTouchDistance.value = 0
      lastTouchCenter.value = null
      options.onDragEnd?.()
    } else if (touchList.length === 1) {
      // 从双指变为单指，切换为拖拽模式
      lastTouchDistance.value = 0
      lastTouchCenter.value = null
      isDragging.value = true
      dragStart.value = { x: touchList[0]!.x, y: touchList[0]!.y }
      cameraStart.value = { x: camera.x, z: camera.z }
    }
  }
  
  // 触摸取消
  function onTouchCancel() {
    touches.value.clear()
    isDragging.value = false
    dragStart.value = null
    cameraStart.value = null
    lastTouchDistance.value = 0
    lastTouchCenter.value = null
    options.onDragEnd?.()
  }
  
  // 阻止默认的触摸行为（防止页面滚动）
  function preventTouchScroll(e: TouchEvent) {
    if (e.touches.length > 1) {
      e.preventDefault()
    }
  }
  
  onMounted(() => {
    if (!canvasRef.value) return
    
    const canvas = canvasRef.value
    
    // 鼠标事件
    canvas.addEventListener('mousedown', onMouseDown)
    canvas.addEventListener('mouseleave', onMouseLeave)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    
    // 触摸事件
    canvas.addEventListener('touchstart', onTouchStart, { passive: false })
    canvas.addEventListener('touchmove', onTouchMove, { passive: false })
    canvas.addEventListener('touchend', onTouchEnd, { passive: false })
    canvas.addEventListener('touchcancel', onTouchCancel, { passive: false })
    
    // 阻止默认滚动
    document.addEventListener('touchmove', preventTouchScroll, { passive: false })
  })
  
  onUnmounted(() => {
    if (!canvasRef.value) return
    
    const canvas = canvasRef.value
    
    // 移除鼠标事件
    canvas.removeEventListener('mousedown', onMouseDown)
    canvas.removeEventListener('mouseleave', onMouseLeave)
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
    canvas.removeEventListener('wheel', onWheel)
    
    // 移除触摸事件
    canvas.removeEventListener('touchstart', onTouchStart)
    canvas.removeEventListener('touchmove', onTouchMove)
    canvas.removeEventListener('touchend', onTouchEnd)
    canvas.removeEventListener('touchcancel', onTouchCancel)
    
    // 移除默认滚动阻止
    document.removeEventListener('touchmove', preventTouchScroll)
  })
  
  return {
    isDragging,
    updateMouseWorldCoord
  }
}
