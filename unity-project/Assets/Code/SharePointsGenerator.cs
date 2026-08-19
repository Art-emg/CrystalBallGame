using UnityEngine;
using System.Collections.Generic;
using System;
using Random = UnityEngine.Random;

public class SpherePuzzle : MonoBehaviour
{
    [Header("References")] 
    public GameObject pointPrefab;
    public Transform sphereTransform;
    public GameObject targetObject;

    [Header("Settings")] 
    [Range(0.001f, 0.1f)] public float stepSize = 0.02f;

    private List<Vector3> _points = new();
    private float _sphereRadius;
    private float _projectionSize;

    private void Start()
    {
        try{
        _sphereRadius = sphereTransform.localScale.x / 2f;
        Bounds targetBounds = targetObject.GetComponent<Renderer>().bounds;
        _projectionSize = Mathf.Max(targetBounds.size.x, targetBounds.size.y) * 2f;
        
        GeneratePoints();
        }
        catch(Exception e){
            Debug.LogError("Error generating points: " + e.Message);
        }
    }

    private void GeneratePoints()
    {
        _points.Clear();
        Vector3 rayDirection = Vector3.forward;
        Vector3 startPoint = sphereTransform.position - new Vector3(0, 0, _sphereRadius * 2f);
        float halfSize = _projectionSize / 2f;
        
        Vector3 spherePos = sphereTransform.position;
        
        // Pre-allocate vectors to reduce garbage collection
        Vector3 rayOrigin = Vector3.zero;
        
        for (float x = -halfSize; x <= halfSize; x += stepSize)
        {
            for (float y = -halfSize; y <= halfSize; y += stepSize)
            {
                rayOrigin.x = startPoint.x + x;
                rayOrigin.y = startPoint.y + y;
                rayOrigin.z = startPoint.z;
                
                if (SphereRayIntersection(rayOrigin, rayDirection, spherePos, 
                    _sphereRadius, out Vector3 entry, out Vector3 exit))
                {
                    float maxDistance = Vector3.Distance(entry, exit);
                    
                    // Use non-allocating version of Raycast
                    RaycastHit hit;
                    if (Physics.Raycast(entry, rayDirection, out hit, maxDistance) && 
                        hit.collider.gameObject == targetObject)
                    {
                        // Apply random offset in x-y plane (from 0 to stepSize/2)
                        Vector3 basePosition = Vector3.Lerp(entry, exit, Random.value);
                        Vector3 randomOffset = new Vector3(
                            Random.Range(0, stepSize/2),
                            Random.Range(0, stepSize/2),
                            0);
                        
                        // Ensure the point stays within the figure by checking with another raycast
                        Vector3 pointPosition = basePosition + randomOffset;
                        RaycastHit offsetHit;
                        if (!Physics.Raycast(pointPosition, rayDirection, out offsetHit) || 
                            offsetHit.collider.gameObject != targetObject) {
                            // If outside the figure, use the original position
                            pointPosition = basePosition;
                        }
                        _points.Add(pointPosition);
                    }
                }
            }
        }

        SpawnPoints();
    }

    private bool SphereRayIntersection(Vector3 rayOrigin, Vector3 rayDirection, Vector3 sphereCenter,
        float sphereRadius, out Vector3 entry, out Vector3 exit)
    {
        entry = exit = Vector3.zero;

        var l = sphereCenter - rayOrigin;
        var tca = Vector3.Dot(l, rayDirection);
        if (tca < 0) return false;

        var d2 = Vector3.Dot(l, l) - tca * tca;
        var radiusSquared = sphereRadius * sphereRadius;
        if (d2 > radiusSquared) return false;

        var thc = Mathf.Sqrt(radiusSquared - d2);
        var t0 = tca - thc;
        var t1 = tca + thc;
        if (t0 < 0 && t1 < 0) return false;

        entry = rayOrigin + rayDirection * Mathf.Max(0, t0);
        exit = rayOrigin + rayDirection * t1;
        return true;
    }

    private void SpawnPoints()
    {
        foreach (var point in _points)
        {
            var pointObj = Instantiate(pointPrefab, point, Quaternion.identity, sphereTransform);
            pointObj.transform.localScale = Vector3.one * Random.Range(0.005f, 0.02f);
            if (Vector3.Distance(point, sphereTransform.position) > _sphereRadius)
            {
                Destroy(pointObj);
            }
        }
    }
}