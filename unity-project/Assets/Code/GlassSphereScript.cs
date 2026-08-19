using UnityEngine;

public class GlassSphereScript : MonoBehaviour
{
    public float rotationSpeed = 5f;

    private Vector2 _lastMousePosition;
    private bool _isDragging = false;

    private void Update()
    {
        if (Input.touchCount > 0)
        {
            var touch = Input.GetTouch(0);
            if (touch.phase == TouchPhase.Moved)
            {
                var delta = touch.deltaPosition;
                RotateSphere(delta);
            }
        }

        if (Input.GetMouseButtonDown(0))
        {
            _isDragging = true;
            _lastMousePosition = Input.mousePosition;
        }
        else if (Input.GetMouseButtonUp(0))
        {
            _isDragging = false;
        }

        if (_isDragging && Input.GetMouseButton(0)) 
        {
            Vector2 delta = (Vector2)Input.mousePosition - _lastMousePosition;
            RotateSphere(delta);
            _lastMousePosition = Input.mousePosition;
        }
    }

    private void RotateSphere(Vector2 delta)
    {
        var rotationX = delta.y * rotationSpeed * Time.deltaTime;
        var rotationY = -delta.x * rotationSpeed * Time.deltaTime;
        transform.Rotate(rotationX, rotationY, 0, Space.World);
    }
}
